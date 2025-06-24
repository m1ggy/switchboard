import jitsi, { type JitsiMeetJS } from '@/lib/jitsi';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

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
  const activeNumber = useMainStore((state) => state.activeNumber);

  const { data: token } = useQuery(
    trpc.jitsi.token.queryOptions({ roomName: `${activeNumber?.id}-*` })
  );

  const [connection, setConnection] =
    useState<JitsiMeetJS.JitsiConnection | null>(null);
  const [conference, setConference] =
    useState<JitsiMeetJS.JitsiConference | null>(null);

  const connectionRef = useRef<JitsiMeetJS.JitsiConnection | null>(null);

  // Establish connection only once
  useEffect(() => {
    if (!token || connectionRef.current) return;

    jitsi.init();

    const conn = new jitsi.JitsiConnection(null, token, {
      hosts: {
        domain: import.meta.env.VITE_JITSI_DOMAIN,
        muc: import.meta.env.VITE_JITSI_MUC,
      },
      serviceUrl: import.meta.env.VITE_JITSI_SERVICE_URL,
      enableWebsocketResume: true,
      websocketKeepAlive: 5000,
      websocketKeepAliveUrl: import.meta.env.VITE_JITSI_SERVICE_URL,
    });

    conn.addEventListener(
      jitsi.events.connection.CONNECTION_ESTABLISHED,
      () => {
        console.log('[Jitsi] Connection established');
      }
    );
    conn.addEventListener(
      jitsi.events.connection.CONNECTION_FAILED,
      (err: Error) => {
        console.error('[Jitsi] Connection failed:', err);
      }
    );
    conn.addEventListener(
      jitsi.events.connection.CONNECTION_DISCONNECTED,
      () => {
        console.log('[Jitsi] Connection disconnected');
      }
    );

    conn.connect();
    connectionRef.current = conn;
    setConnection(conn);

    return () => {
      // Only disconnect if really unmounting
      conn.disconnect();
      connectionRef.current = null;
    };
  }, [token]);

  const createRoom = useCallback(
    async (
      roomName: string,
      callbacks?: {
        onRemoteTrack?: (track: JitsiMeetJS.JitsiTrack) => void;
        onLocalTrack?: (track: JitsiMeetJS.JitsiTrack) => void;
      }
    ) => {
      const conn = connectionRef.current;
      if (!conn) throw new Error('[Jitsi] No active connection');

      const conf = conn.initJitsiConference(roomName, {
        openBridgeChannel: true,
      });

      setConference(conf);

      conf.on(jitsi.events.conference.CONFERENCE_JOINED, () => {
        console.log('[Jitsi] Joined conference:', roomName);
      });

      conf.on(jitsi.events.conference.CONFERENCE_LEFT, () => {
        console.log('[Jitsi] Left conference');
        setConference(null);
      });

      conf.on(jitsi.events.conference.TRACK_ADDED, (track) => {
        if (!track.isLocal()) callbacks?.onRemoteTrack?.(track);
      });

      const localTracks = await jitsi.createLocalTracks({
        devices: ['audio', 'video'],
      });

      for (const track of localTracks) {
        await conf.addTrack(track);
        callbacks?.onLocalTrack?.(track);
      }

      conf.join();

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

      return { conference: conf, localStreams };
    },
    []
  );

  return (
    <JitsiContext.Provider value={{ connection, conference, createRoom }}>
      {children}
    </JitsiContext.Provider>
  );
};
