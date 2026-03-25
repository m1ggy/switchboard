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
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [callDuration, setCallDuration] = useState(0);

  const remoteAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const hasInitialized = useRef(false);
  const connRef = useRef<JitsiMeetJS.JitsiConnection | null>(null);

  const jwt = searchParams.get('jwt');
  const companyName = searchParams.get('companyName') ?? 'Agent';

  const remoteVideoTrack = useMemo(
    () =>
      remoteStreams.find(
        (stream) => stream.isVideoTrack() && !stream.isLocal()
      ) ?? null,
    [remoteStreams]
  );

  const remoteAudioTracks = useMemo(
    () =>
      remoteStreams.filter(
        (stream) => stream.isAudioTrack() && !stream.isLocal()
      ),
    [remoteStreams]
  );

  useEffect(() => {
    if (!conference) return;

    const interval = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [conference]);

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
        console.error('[Remote Audio] attach failed:', err);
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
        } catch (err) {
          console.warn('[Remote Audio] detach failed:', err);
        }
      });
    };
  }, [remoteAudioTracks]);

  useEffect(() => {
    if (!remoteVideoTrack || !remoteVideoTrack.getTrackStreamingStatus) {
      setConnectionQuality(null);
      return;
    }

    const interval = setInterval(() => {
      const status = remoteVideoTrack.getTrackStreamingStatus?.();

      if (status === 'active') {
        setConnectionQuality(2);
      } else if (status === 'interrupted') {
        setConnectionQuality(1);
      } else {
        setConnectionQuality(0);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [remoteVideoTrack]);

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
    let createdAudioTrack: JitsiMeetJS.JitsiTrack | null = null;
    let createdVideoTrack: JitsiMeetJS.JitsiTrack | null = null;

    conn.addEventListener(
      jitsi.events.connection.CONNECTION_ESTABLISHED,
      async () => {
        try {
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

          createdVideoTrack = videoTrack;
          createdAudioTrack = audioTrack;

          setLocalVideo(videoTrack);
          setLocalAudio(audioTrack);

          conf = conn.initJitsiConference(callId as string, {
            config: {
              p2p: { enabled: true },
            },
          });

          setConference(conf);

          conf.on(jitsi.events.conference.CONFERENCE_JOINED, async () => {
            try {
              await conf.addTrack(videoTrack);
              await conf.addTrack(audioTrack);
              toast.success('Joined room');
            } catch (err) {
              console.error('[Jitsi] Failed to add local tracks:', err);
              toast.error('Failed to publish local media');
            } finally {
              toast.dismiss(loadingToast);
              setIsInitializing(false);
            }
          });

          conf.on(jitsi.events.conference.CONFERENCE_LEFT, () => {
            try {
              createdAudioTrack?.dispose();
            } catch {}

            try {
              createdVideoTrack?.dispose();
            } catch {}

            setIsCallDone(true);
          });

          conf.on(jitsi.events.conference.USER_JOINED, (user) => {
            console.log('USER JOINED:', user);
          });

          conf.on(
            jitsi.events.conference.TRACK_ADDED,
            (track: JitsiMeetJS.JitsiTrack) => {
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
        } catch (err) {
          console.error('[Jitsi] Initialization failed:', err);
          toast.error('Failed to initialize local media');
          setIsErrored(true);
          setIsInitializing(false);
          toast.dismiss(loadingToast);
        }
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

      try {
        conf?.leave?.();
      } catch {}

      try {
        createdAudioTrack?.dispose?.();
      } catch {}

      try {
        createdVideoTrack?.dispose?.();
      } catch {}

      try {
        connRef.current?.disconnect?.();
      } catch {}
    };
  }, [jwt, callId]);

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
                <div className="rounded bg-black/20 px-2 py-1 font-mono text-xs">
                  {formatDuration(callDuration)}
                </div>
              </div>

              <div className="flex">
                {remoteVideoTrack ? (
                  <VideoTrackPreview
                    track={remoteVideoTrack}
                    label={companyName}
                    className="h-fit"
                  />
                ) : (
                  <div className="flex h-[40vh] w-full items-center justify-center">
                    <Loader className="mr-2 h-6 w-6 animate-spin" />
                    <span className="text-sm">Waiting for participant...</span>
                  </div>
                )}
              </div>

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

              <div className="mt-2 flex justify-end">
                {localVideo ? (
                  <VideoTrackPreview
                    track={localVideo}
                    className="w-1/3"
                    label="You"
                    muted
                  />
                ) : (
                  <div className="flex h-[100px] w-1/3 items-center justify-center rounded-md border">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    <span className="text-sm">Setting up camera...</span>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter>
              <div className="flex justify-end gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setVideoOff((prev) => {
                      const newState = !prev;

                      try {
                        if (newState) {
                          localVideo?.mute();
                        } else {
                          localVideo?.unmute();
                        }
                      } catch (err) {
                        console.error('[Local Video] mute toggle failed:', err);
                      }

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

                      try {
                        if (newState) {
                          localAudio?.mute();
                        } else {
                          localAudio?.unmute();
                        }
                      } catch (err) {
                        console.error('[Local Audio] mute toggle failed:', err);
                      }

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
