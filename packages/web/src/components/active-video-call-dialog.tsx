import { useJitsi } from '@/hooks/jitsi-provider';
import useMainStore from '@/lib/store';
import {
  useVideoCallStore,
  useVideoCallStreamStore,
} from '@/lib/stores/videocall';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
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
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});

  const remoteAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const { data: contact } = useQuery({
    ...trpc.contacts.findContactById.queryOptions({
      contactId: currentCallContactId as string,
    }),
    enabled: !!currentCallContactId,
  });

  const remoteVideoTrack = useMemo(
    () =>
      remote.find((track) => track.isVideoTrack() && !track.isLocal()) ?? null,
    [remote]
  );

  const remoteAudioTracks = useMemo(
    () => remote.filter((track) => track.isAudioTrack() && !track.isLocal()),
    [remote]
  );

  useEffect(() => {
    let frameId: number;

    const pollAudioLevels = () => {
      const nextSpeakingMap: Record<string, boolean> = {};

      remoteAudioTracks.forEach((track) => {
        const id = track.getId?.();
        // @ts-ignore
        const level = track.getAudioLevel?.() ?? 0;

        if (id) {
          nextSpeakingMap[id] = level > 0.1;
        }
      });

      setSpeakingMap(nextSpeakingMap);
      frameId = requestAnimationFrame(pollAudioLevels);
    };

    if (remoteAudioTracks.length > 0) {
      frameId = requestAnimationFrame(pollAudioLevels);
    } else {
      setSpeakingMap({});
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [remoteAudioTracks]);

  useEffect(() => {
    remoteAudioTracks.forEach((track) => {
      const trackId = track.getId?.();
      if (!trackId) return;

      const el = remoteAudioRefs.current[trackId];
      if (!el) return;

      try {
        track.attach(el);
        el.autoplay = true;
        el.playsInline = true;
        el.muted = false;

        const playPromise = el.play?.();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            console.warn('[Remote Audio] autoplay blocked:', err);
          });
        }
      } catch (err) {
        console.error('[Remote Audio] Failed to attach:', err);
      }
    });

    return () => {
      remoteAudioTracks.forEach((track) => {
        const trackId = track.getId?.();
        if (!trackId) return;

        const el = remoteAudioRefs.current[trackId];
        if (!el) return;

        try {
          track.detach(el);
        } catch {
          // ignore detach issues
        }
      });
    };
  }, [remoteAudioTracks]);

  async function endCall() {
    try {
      if (conference) {
        try {
          await conference.leave();
        } catch (err) {
          console.warn('[Conference] leave failed, trying end()', err);

          try {
            await conference.end();
          } catch (endErr) {
            console.warn('[Conference] end failed', endErr);
          }
        }
      }
    } finally {
      try {
        local?.dispose();
      } catch (err) {
        console.warn('[Local Video] dispose failed', err);
      }

      try {
        localAudio?.dispose();
      } catch (err) {
        console.warn('[Local Audio] dispose failed', err);
      }

      setActiveVideoCallDialogShown(false);
    }
  }

  const speakingAudioTrackId =
    remoteAudioTracks
      .find(
        (audioTrack) =>
          audioTrack.getParticipantId?.() ===
          remoteVideoTrack?.getParticipantId?.()
      )
      ?.getId?.() ?? '';

  return (
    <Dialog open={activeVideoCallDialogShown}>
      <DialogContent className="[&>button:last-child]:hidden !w-[90vw] !max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {contact?.label} ({contact?.number})
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex min-h-0 flex-1 gap-2">
            <div className="flex-1 min-h-[400px]">
              {remoteVideoTrack ? (
                <VideoTrackPreview
                  key={remoteVideoTrack.getId?.() ?? 'remote-video'}
                  track={remoteVideoTrack}
                  label={contact?.label}
                  isSpeaking={speakingMap[speakingAudioTrackId]}
                  className="h-full min-h-[400px] w-full"
                />
              ) : (
                <div className="flex h-full min-h-[400px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                  Waiting for remote video...
                </div>
              )}
            </div>

            {local && (
              <VideoTrackPreview
                track={local}
                label="ME"
                muted
                className="w-1/4 min-w-[140px] max-w-[220px] self-start"
              />
            )}

            {remoteAudioTracks.map((track) => {
              const trackId = track.getId?.();
              if (!trackId) return null;

              return (
                <audio
                  key={trackId}
                  ref={(el) => {
                    remoteAudioRefs.current[trackId] = el;
                  }}
                  autoPlay
                  playsInline
                />
              );
            })}
          </div>

          <div className="flex w-full flex-col gap-4 lg:w-[320px]">
            <div>
              <h3 className="mb-2 text-lg font-semibold">Contact Info</h3>
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

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setVideoMuted((prev) => {
                const isMuted = !prev;

                try {
                  if (isMuted) {
                    local?.mute();
                  } else {
                    local?.unmute();
                  }
                } catch (err) {
                  console.error('[Local Video] mute toggle failed:', err);
                }

                return isMuted;
              });
            }}
          >
            {videoMuted ? <VideoOff /> : <Video />}
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setMuted((prev) => {
                const isMuted = !prev;

                try {
                  if (isMuted) {
                    localAudio?.mute();
                  } else {
                    localAudio?.unmute();
                  }
                } catch (err) {
                  console.error('[Local Audio] mute toggle failed:', err);
                }

                return isMuted;
              });
            }}
          >
            {muted ? <MicOff /> : <Mic />}
          </Button>

          <Button
            variant="destructive"
            onClick={async () => {
              await endCall();
            }}
          >
            END
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ActiveVideoCallDialog;
