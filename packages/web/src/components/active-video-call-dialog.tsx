import { useJitsi } from '@/hooks/jitsi-provider';
import useMainStore from '@/lib/store';
import {
  useVideoCallStore,
  useVideoCallStreamStore,
} from '@/lib/stores/videocall';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { VideoTrackPreview } from './video-preview';
import VideoCallNotes from './videocall-notes';

function ActiveVideoCallDialog() {
  const trpc = useTRPC();
  const { currentCallContactId } = useVideoCallStore();
  const {
    activeVideoCallDialogShown,
    setActiveVideoCallDialogShown,
    activeCompany,
  } = useMainStore();
  const { remote, local, localAudio } = useVideoCallStreamStore();
  const { conference } = useJitsi();
  const [muted, setMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const { data: contact } = useQuery({
    ...trpc.contacts.findContactById.queryOptions({
      contactId: currentCallContactId as string,
    }),
    enabled: !!currentCallContactId,
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<HTMLVideoElement[]>([]);
  const remoteAudioRefs = useRef<HTMLAudioElement[]>([]);

  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let frameId: number;

    const pollAudioLevels = () => {
      const newSpeakingMap: Record<string, boolean> = {};

      remote
        .filter((track) => track.isAudioTrack())
        .forEach((track) => {
          //@ts-ignore
          const id = track.getId?.() ?? track.track?.id; // Fallback to raw ID if needed
          //@ts-ignore
          const level = track.getAudioLevel?.();
          newSpeakingMap[id] = level > 0.1; // Adjust threshold as needed
        });

      setSpeakingMap(newSpeakingMap);
      frameId = requestAnimationFrame(pollAudioLevels);
    };

    if (remote?.length) {
      frameId = requestAnimationFrame(pollAudioLevels);
    }

    return () => cancelAnimationFrame(frameId);
  }, [remote]);

  // Attach local track
  useEffect(() => {
    if (!local || !localVideoRef.current) return;

    const el = localVideoRef.current;

    console.log('SETTING LOCAL: ', local, el);

    requestAnimationFrame(() => {
      try {
        local.attach(el);
        el.muted = true;
      } catch (err) {
        console.error('[Local Track] Failed to attach:', err);
      }
    });

    return () => {
      try {
        local.detach(el);
      } catch (err) {
        console.warn('[Local Track] Failed to detach or already detached.');
      }
    };
  }, [local, localVideoRef.current]);

  // Attach remote tracks
  useEffect(() => {
    if (!remote?.length) return;

    // Attach video
    remote
      .filter((track) => track.isVideoTrack())
      .forEach((track, i) => {
        const el = remoteVideoRefs.current[i];
        if (track && el) {
          track.attach(el);
        }
      });

    // Attach audio
    remote
      .filter((track) => track.isAudioTrack())
      .forEach((track, i) => {
        const el = remoteAudioRefs.current[i];
        if (track && el) {
          track.attach(el);
        }
      });
  }, [remote]);

  function endCall() {
    conference?.end();
    local?.dispose();
    localAudio?.dispose();
  }

  return (
    <Dialog
      open={activeVideoCallDialogShown}
      onOpenChange={(open) => {
        if (!open) endCall();
        setActiveVideoCallDialogShown(open);
      }}
    >
      <DialogClose />
      <DialogContent className="[&>button:last-child]:hidden !w-[90vw] !max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {contact?.label} ({contact?.number})
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex gap-1 flex-1">
            {/* Video Panel */}
            <div className="flex-1">
              {remote
                .filter((track) => track.isVideoTrack())
                .map((_) => (
                  <VideoTrackPreview
                    track={_}
                    label={contact?.label}
                    isSpeaking={speakingMap[_.getId?.() ?? '']}
                  />
                ))}
            </div>
            {remote
              .filter((track) => track.isAudioTrack())
              .map((_, i) => (
                <audio
                  key={`audio-${i}`}
                  ref={(el) => {
                    if (el) remoteAudioRefs.current[i] = el;
                  }}
                  autoPlay
                  playsInline
                />
              ))}
            {local && (
              <VideoTrackPreview
                track={local}
                label="ME"
                muted
                className="w-1/4 h-fit"
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-[320px] flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-lg mb-2">Contact Info</h3>
              <p className="text-sm text-muted-foreground">
                {contact?.label}
                <br />({contact?.number})
              </p>
            </div>

            <VideoCallNotes
              contactId={contact?.id as string}
              roomId={`${activeCompany?.id}-${contact?.id}`}
            />
          </div>
        </div>

        {/* Footer Controls */}
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant={'outline'}
            onClick={() => {
              setVideoMuted((prev) => {
                const isMuted = !prev;

                if (isMuted) {
                  local?.mute();
                } else local?.unmute();

                return isMuted;
              });
            }}
          >
            {videoMuted ? <VideoOff /> : <Video />}
          </Button>
          <Button
            variant={'outline'}
            onClick={() => {
              setMuted((prev) => {
                const isMuted = !prev;

                if (isMuted) {
                  localAudio?.mute();
                } else localAudio?.unmute();

                return isMuted;
              });
            }}
          >
            {muted ? <MicOff /> : <Mic />}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setActiveVideoCallDialogShown(false)}
          >
            END
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ActiveVideoCallDialog;
