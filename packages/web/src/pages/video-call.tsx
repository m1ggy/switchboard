import { useTheme } from '@/components/theme-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { VideoTrackPreview } from '@/components/video-preview';
import jitsi, { type JitsiMeetJS } from '@/lib/jitsi';
import {
  Loader,
  LucideVideo,
  Mic,
  MicOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

function VideoCall() {
  const { callId } = useParams();
  const [searchParams] = useSearchParams();
  const theme = useTheme();

  const [localVideo, setLocalVideo] = useState<JitsiMeetJS.JitsiTrack | null>(
    null
  );
  const [localAudio, setLocalAudio] = useState<JitsiMeetJS.JitsiTrack | null>(
    null
  );
  const [remoteStreams, setRemoteStreams] = useState<JitsiMeetJS.JitsiTrack[]>(
    []
  );
  const [isErrored, setIsErrored] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [isCallDone, setIsCallDone] = useState(false);
  const [conference, setConference] =
    useState<JitsiMeetJS.JitsiConference | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const remoteAudioRefs = useRef<HTMLAudioElement[]>([]);
  const hasInitialized = useRef(false);
  const connRef = useRef<JitsiMeetJS.JitsiConnection | null>(null);

  const jwt = searchParams.get('jwt');

  console.log({ events: jitsi.events });

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    jitsi.init();

    const loadingToast = toast.loading('Initializing connection');

    const conn = new jitsi.JitsiConnection(null, jwt, {
      hosts: {
        domain: import.meta.env.VITE_JITSI_DOMAIN,
        muc: import.meta.env.VITE_JITSI_MUC,
      },
      serviceUrl: import.meta.env.VITE_JITSI_SERVICE_URL,
      enableWebsocketResume: true,
      websocketKeepAlive: 3000,
      bosh: `wss://${import.meta.env.VITE_JITSI_DOMAIN}/http-bind`,
    });

    connRef.current = conn;

    let conf: JitsiMeetJS.JitsiConference;

    conn.addEventListener(
      jitsi.events.connection.CONNECTION_ESTABLISHED,
      async () => {
        toast.success('Connection Established');

        const localTracks = await jitsi.createLocalTracks({
          devices: ['audio', 'video'],
        });
        const videoTrack = localTracks.find(
          (t: JitsiMeetJS.JitsiTrack) => t.getType() === 'video'
        )!;
        const audioTrack = localTracks.find(
          (t: JitsiMeetJS.JitsiTrack) => t.getType() === 'audio'
        )!;

        setLocalVideo(videoTrack);
        setLocalAudio(audioTrack);

        conf = conn.initJitsiConference(callId as string, {
          config: { p2p: { enabled: true } },
        });

        conf.addTrack(videoTrack);
        conf.addTrack(audioTrack);
        setConference(conf);

        conf.on(jitsi.events.conference.CONFERENCE_JOINED, () => {
          toast.success('Joined room');
          toast.dismiss(loadingToast);
          setIsInitializing(false);
        });

        conf.on(jitsi.events.conference.USER_LEFT, (user) => {
          console.log('USER LEFT: ', user);
          const participantCount = conf.getParticipantCount();
          if (participantCount === 0 && !isCallDone) {
            conf.leave();
            setIsCallDone(true);
          }
        });

        conf.on(
          jitsi.events.conference.TRACK_ADDED,
          (track: JitsiMeetJS.JitsiTrack) => {
            if (!track.isLocal()) {
              setRemoteStreams((prev) => {
                const exists = prev.find(
                  (stream) => stream.getId() === track.getId()
                );
                return exists ? prev : [...prev, track];
              });
            }
          }
        );

        conf.on(
          jitsi.events.conference.TRACK_REMOVED,
          (track: JitsiMeetJS.JitsiTrack) => {
            if (!track.isLocal()) {
              setRemoteStreams((prev) => {
                const updated = prev.filter((t) => t.getId() !== track.getId());

                if (updated.length === 0 && !isCallDone) {
                  console.log(
                    '[Jitsi] All remote tracks removed — assuming call ended.'
                  );
                  conf.leave();
                  setIsCallDone(true);
                }

                return updated;
              });
            }
          }
        );

        conf.join();
      }
    );

    conn.addEventListener(
      jitsi.events.connection.CONNECTION_FAILED,
      (err: Error) => {
        console.error('[Jitsi] Connection failed:', err);
        toast.error('Connection failed');
        setIsErrored(true);
        setIsInitializing(false);
        toast.dismiss(loadingToast);
      }
    );

    conn.addEventListener(
      jitsi.events.connection.CONNECTION_DISCONNECTED,
      () => {
        console.log('[Jitsi] Connection disconnected');
        toast('Disconnected');
        toast.dismiss(loadingToast);
        setIsInitializing(false);
      }
    );

    conn.connect();

    return () => {
      hasInitialized.current = false;
      conference?.leave?.();
      connRef.current?.disconnect?.();
    };
  }, [jwt]);

  if (isInitializing) {
    return (
      <div className="justify-center flex items-center h-[100vh]">
        <div className="flex gap-2 items-center">
          <Loader className="animate-spin" />
          <span className="font-semibold text-sm">
            Initializing connection...
          </span>
        </div>
      </div>
    );
  }

  if (isCallDone) {
    return (
      <div className="px-10 mt-10">
        <div className="flex justify-center mt-10">
          <img
            src={`/calliya-${theme.theme}.png`}
            alt="Calliya"
            className="w-[160px] h-auto object-contain"
          />
        </div>
        <Alert className="mt-10">
          <Video />
          <AlertTitle>Call Ended</AlertTitle>
          <AlertDescription>
            Thanks for joining the call. We hope you had a great experience with
            Calliya!
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-center mt-10">
        <img
          src={`/calliya-${theme.theme}.png`}
          alt="Calliya"
          className="w-[160px] h-auto object-contain"
        />
      </div>

      {isErrored && (
        <div className="px-10 mt-10">
          <Alert variant="destructive">
            <LucideVideo />
            <AlertTitle>Connection Failed</AlertTitle>
            <AlertDescription>
              We couldn’t connect to the video call server. Please check your
              internet connection and try again. If the issue persists, contact
              support.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!isErrored && (
        <div className="flex justify-center">
          <Card className="w-[90vw]">
            <CardContent>
              <div>
                {remoteStreams
                  .filter(
                    (stream) => stream.isVideoTrack() && !stream.isLocal()
                  )
                  .map((stream) => (
                    <VideoTrackPreview
                      key={stream.getId()}
                      track={stream}
                      label=""
                    />
                  ))}
              </div>

              {remoteStreams
                .filter((stream) => stream.isAudioTrack())
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

              {localVideo && (
                <div className="flex justify-end mt-2">
                  <VideoTrackPreview
                    track={localVideo}
                    className="w-1/3"
                    label="YOU"
                  />
                </div>
              )}
            </CardContent>

            <CardFooter>
              <div className="flex gap-2 justify-end">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setVideoOff((prev) => {
                      const newState = !prev;
                      newState ? localVideo?.mute() : localVideo?.unmute();
                      return newState;
                    });
                  }}
                >
                  {videoOff ? <Video /> : <VideoOff />}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setMuted((prev) => {
                      const newState = !prev;
                      newState ? localAudio?.mute() : localAudio?.unmute();
                      return newState;
                    });
                  }}
                >
                  {muted ? <Mic /> : <MicOff />}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}

export default VideoCall;
