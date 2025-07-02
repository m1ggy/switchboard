import { app } from '@/lib/firebase';
import jitsi, { type JitsiMeetJS } from '@/lib/jitsi';
import useMainStore from '@/lib/store';
import { useVideoCallStreamStore } from '@/lib/stores/videocall';
import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import { getAuth } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

type JitsiContextValues = {
  connection: JitsiMeetJS.JitsiConnection | null;
  conference: JitsiMeetJS.JitsiConference | null;
  createRoom: (
    roomName: string,
    callbacks?: {
      onRemoteTrack?: (track: JitsiMeetJS.JitsiTrack) => void;
      onLocalTrack?: (track: JitsiMeetJS.JitsiTrack) => void;
    }
  ) => Promise<{
    conference: JitsiMeetJS.JitsiConference;
    localStreams: MediaStream[];
  }>;
};

interface Props {
  children: ReactNode;
}

const JitsiContext = createContext<JitsiContextValues | null>(null);

export const useJitsi = () => {
  const context = useContext(JitsiContext);
  if (!context) throw new Error('useJitsi must be used within a JitsiProvider');
  return context;
};

export const JitsiProvider = ({ children }: Props) => {
  const trpc = useTRPC();
  const { addRemote, removeRemote, setLocal, setLocalAudio } =
    useVideoCallStreamStore();
  const activeNumber = useMainStore((state) => state.activeNumber);
  const activeCompany = useMainStore((state) => state.activeCompany);

  const [connection, setConnection] =
    useState<JitsiMeetJS.JitsiConnection | null>(null);
  const [conference, setConference] =
    useState<JitsiMeetJS.JitsiConference | null>(null);
  const { mutateAsync: getCallUrl } = useMutation(
    trpc.jitsi.getClientCallURL.mutationOptions()
  );

  const connectionRef = useRef<JitsiMeetJS.JitsiConnection | null>(null);

  // Establish connection only once
  useEffect(() => {
    if (connectionRef.current) return;

    jitsi.init();
  }, []);

  const createRoom = useCallback(
    async (
      roomName: string,
      callbacks?: {
        onRemoteTrack?: (track: JitsiMeetJS.JitsiTrack) => void;
        onLocalTrack?: (track: JitsiMeetJS.JitsiTrack) => void;
      }
    ) => {
      const conferenceName = `${activeNumber?.id}-${roomName}`;
      const connectionToast = toast.loading(
        'Creating video call connection...'
      );
      const auth = getAuth(app);
      const authToken = await auth.currentUser?.getIdToken(true);
      const tokenResponse = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/jitsi/token?roomName=${conferenceName}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}` as string,
          },
          method: 'GET',
        }
      );

      const { token = null } = await tokenResponse.json();
      console.log(`[Jitsi] Token: ${token}`);

      const conn = new jitsi.JitsiConnection(null, token, {
        hosts: {
          domain: import.meta.env.VITE_JITSI_DOMAIN,
          muc: import.meta.env.VITE_JITSI_MUC,
        },
        serviceUrl: import.meta.env.VITE_JITSI_SERVICE_URL,
        enableWebsocketResume: true,
        websocketKeepAlive: 3000,
        bosh: `wss://${import.meta.env.VITE_JITSI_DOMAIN}/http-bind`,
      });

      connectionRef.current = conn;
      setConnection(conn);

      const localTracks: JitsiMeetJS.JitsiTrack[] =
        await jitsi.createLocalTracks({
          devices: ['audio', 'video'],
        });

      const videoTrack = localTracks.find(
        (track) => track.getType() === 'video'
      );
      const audioTrack = localTracks.find(
        (track) => track.getType() === 'audio'
      );
      setLocal(videoTrack as JitsiMeetJS.JitsiTrack);
      setLocalAudio(audioTrack as JitsiMeetJS.JitsiTrack);

      const localStreams: MediaStream[] = [];

      const videoStream = new MediaStream(
        localTracks
          .filter((t: JitsiMeetJS.JitsiTrack) => t.getType() === 'video')
          .map((t: JitsiMeetJS.JitsiTrack) => t.getTrack())
      );
      const audioStream = new MediaStream(
        localTracks
          .filter((t: JitsiMeetJS.JitsiTrack) => t.getType() === 'audio')
          .map((t: JitsiMeetJS.JitsiTrack) => t.getTrack())
      );

      if (videoStream.getTracks().length) localStreams.push(videoStream);
      if (audioStream.getTracks().length) localStreams.push(audioStream);

      // 🔁 Promise to resolve when conference is ready
      return new Promise<{
        conference: JitsiMeetJS.JitsiConference;
        localStreams: MediaStream[];
      }>((resolve, reject) => {
        conn.addEventListener(
          jitsi.events.connection.CONNECTION_ESTABLISHED,
          async () => {
            console.log('[Jitsi] Connection established');
            toast.success('Connection created');
            console.log({ conferenceName });

            const conf: JitsiMeetJS.JitsiConference = conn.initJitsiConference(
              conferenceName,
              {
                config: { p2p: { enabled: true } },
              }
            );

            setConference(conf);

            conf.on(jitsi.events.conference.CONFERENCE_JOINED, async () => {
              toast.info('Joined room, please wait for the client!');
              toast.dismiss(connectionToast);
              console.log('[Jitsi] Joined conference:', conferenceName);
              const smsToastLoading = toast.loading(
                'Sending invite to contact via SMS...'
              );

              await getCallUrl({
                numberId: activeNumber?.id as string,
                contactId: roomName,
                companyId: activeCompany?.id as string,
              });
              toast.dismiss(smsToastLoading);
              toast.success('URL sent to contact!');
            });

            conf.on(jitsi.events.conference.CONFERENCE_LEFT, () => {
              console.log('[Jitsi] Left conference');
              setConference(null);
            });

            conf.on(
              jitsi.events.conference.TRACK_ADDED,
              (track: JitsiMeetJS.JitsiTrack) => {
                if (!track.isLocal()) {
                  callbacks?.onRemoteTrack?.(track);

                  addRemote(track);
                } else {
                  if (track.isVideoTrack()) setLocal(track);
                }
              }
            );

            conf.on(
              jitsi.events.conference.TRACK_REMOVED,
              (track: JitsiMeetJS.JitsiTrack) => {
                if (!track.isLocal()) {
                  console.log('[Jitsi] Remote track removed:', track);
                  // Do something like removing the video element for that track
                  removeRemote(track);
                } else {
                  console.log('[Jitsi] Local track removed:', track);
                }
              }
            );

            for (const track of localTracks) {
              await conf.addTrack(track);
              callbacks?.onLocalTrack?.(track);
            }

            conf.setDisplayName(activeCompany?.name as string);
            console.log('[Jitsi] Joining conference now...');
            conf.join();

            resolve({ conference: conf, localStreams });
          }
        );

        conn.addEventListener(
          jitsi.events.connection.CONNECTION_FAILED,
          (err: Error) => {
            console.error('[Jitsi] Connection failed:', err);
            reject(err);
          }
        );

        conn.addEventListener(
          jitsi.events.connection.CONNECTION_DISCONNECTED,
          () => {
            console.log('[Jitsi] Connection disconnected');
          }
        );

        conn.connect();
      });
    },
    [getCallUrl]
  );

  return (
    <JitsiContext.Provider value={{ connection, conference, createRoom }}>
      {children}
    </JitsiContext.Provider>
  );
};
