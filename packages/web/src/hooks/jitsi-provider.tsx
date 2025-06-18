import JitsiMeetJS from '@/lib/jitsi';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

type JitsiContextValues = {
  connection: JitsiMeetJS.JitsiConnection | null;
};

interface Props {
  children: ReactNode;
}

const JitsiContext = createContext<JitsiContextValues | null>(null);

export const useJitsi = () => {
  const context = useContext(JitsiContext);

  if (!context) {
    throw new Error('useJitsi must be used within a JitsiProvider');
  }

  return context;
};

export const JitsiProvider = ({ children }: Props) => {
  const [connection, setConnection] =
    useState<JitsiMeetJS.JitsiConnection | null>(null);

  useEffect(() => {
    JitsiMeetJS.init();

    const conn = new JitsiMeetJS.JitsiConnection(null, null, {
      hosts: {
        domain: import.meta.env.VITE_JITSI_DOMAIN,
        muc: import.meta.env.VITE_JITSI_MUC,
      },
      serviceUrl: import.meta.env.VITE_JITSI_SERVICE_URL,
    });

    const onConnectionSuccess = (...args: unknown[]) => {
      console.log({ args });
      console.log('[Jitsi] Connection established');
    };

    const onConnectionFailed = (error: any) => {
      console.error('[Jitsi] Connection failed:', error);
    };

    const onDisconnected = () => {
      console.log('[Jitsi] Connection disconnected');
    };

    conn.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
      onConnectionSuccess
    );
    conn.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_FAILED,
      onConnectionFailed
    );
    conn.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
      onDisconnected
    );

    conn.connect();

    setConnection(conn);

    return () => {
      conn.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onConnectionSuccess
      );
      conn.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onConnectionFailed
      );
      conn.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        onDisconnected
      );
      conn.disconnect();
    };
  }, []);

  return (
    <JitsiContext.Provider value={{ connection }}>
      {children}
    </JitsiContext.Provider>
  );
};
