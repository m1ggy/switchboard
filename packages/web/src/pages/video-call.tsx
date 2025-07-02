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
  Signal,
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
  const [connectionQuality, setConnectionQuality] = useState<number | null>(
    null
  );
  const [callDuration, setCallDuration] = useState(0); // in seconds

  const remoteAudioRefs = useRef<HTMLAudioElement[]>([]);
  const hasInitialized = useRef(false);
  const connRef = useRef<JitsiMeetJS.JitsiConnection | null>(null);

  const jwt = searchParams.get('jwt');

  const companyName = searchParams.get('companyName') ?? 'Agent';

  // Call timer
  useEffect(() => {
    if (!conference) return;
    const interval = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [conference]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

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
    let statusInterval: NodeJS.Timeout;

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

        conf.on(jitsi.events.conference.CONFERENCE_LEFT, () => {
          audioTrack.dispose();
          videoTrack.dispose();
          setIsCallDone(true);
        });

        conf.on(jitsi.events.conference.USER_JOINED, (user) => {
          console.log('USER JOINED: ', user);
        });

        conf.on(
          jitsi.events.conference.TRACK_ADDED,
          (track: JitsiMeetJS.JitsiTrack) => {
            console.log('TRACK ADDED: ', track);
            if (!track.isLocal()) {
              setRemoteStreams((prev) => {
                const exists = prev.find((t) => t.getId() === track.getId());
                return exists ? prev : [...prev, track];
              });
            }
          }
        );

        conf.on(
          jitsi.events.conference.TRACK_REMOVED,
          (track: JitsiMeetJS.JitsiTrack) => {
            if (!track.isLocal()) {
              setRemoteStreams((prev) =>
                prev.filter((t) => t.getId() !== track.getId())
              );
            }
          }
        );

        conf.join();

        // Poll connection status from remote track
        statusInterval = setInterval(() => {
          const remoteTrack = remoteStreams.find(
            (track) => track.isVideoTrack() && !track.isLocal()
          );

          if (!remoteTrack || !remoteTrack.getTrackStreamingStatus) {
            setConnectionQuality(null);
            return;
          }

          const status = remoteTrack.getTrackStreamingStatus();

          if (status === 'active') {
            setConnectionQuality(2); // Excellent
          } else if (status === 'interrupted') {
            setConnectionQuality(1); // Good
          } else {
            setConnectionQuality(0); // Poor
          }
        }, 5000);
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
      clearInterval(statusInterval);
    };
  }, [jwt]);

  if (isInitializing) {
    return (
      <div className="h-[100vh] flex justify-center items-center">
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

  const remoteVideoTrack = remoteStreams.find(
    (stream) => stream.isVideoTrack() && !stream.isLocal()
  );

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
              internet connection and try again.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!isErrored && (
        <div className="flex justify-center">
          <Card className="w-[90vw]">
            <CardContent>
              <div className="top-4 right-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Signal className="w-4 h-4" />
                  {connectionQuality !== null ? (
                    <span>
                      {['Poor', 'Good', 'Excellent'][connectionQuality] ||
                        'Unknown'}
                    </span>
                  ) : null}
                </div>
                <div className="font-mono text-xs bg-black/20 px-2 py-1 rounded">
                  {formatDuration(callDuration)}
                </div>
              </div>

              {/* Remote Video */}
              <div className="flex">
                {remoteVideoTrack ? (
                  <VideoTrackPreview
                    track={remoteVideoTrack}
                    label={companyName}
                    className="h-fit"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-[40vh]">
                    <Loader className="animate-spin w-6 h-6 mr-2" />
                    <span className="text-sm">Waiting for participant...</span>
                  </div>
                )}
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

              {/* Local Video */}
              <div className="flex justify-end mt-2">
                {localVideo ? (
                  <VideoTrackPreview
                    track={localVideo}
                    className="w-1/3"
                    label="You"
                  />
                ) : (
                  <div className="w-1/3 h-[100px] flex items-center justify-center border rounded-md">
                    <Loader className="animate-spin mr-2 w-4 h-4" />
                    <span className="text-sm">Setting up camera...</span>
                  </div>
                )}
              </div>
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
                  {videoOff ? <VideoOff /> : <Video />}
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
                  {muted ? <MicOff /> : <Mic />}
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
