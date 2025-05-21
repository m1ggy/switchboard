import { TwilioVoiceClient } from '@/lib/voice';
import { useEffect, useRef, useState } from 'react';

export const useTwilioVoice = (token: string) => {
  const clientRef = useRef<TwilioVoiceClient | null>(null);
  const [ready, setReady] = useState(false); // trigger re-renders when needed
  console.log({ token });

  useEffect(() => {
    if (!token) return;

    const client = new TwilioVoiceClient({
      token,
      onIncomingCall: (conn) => {
        console.log('Incoming call', conn);
        conn.accept();
      },
      onDisconnect: () => {
        console.log('Call disconnected');
      },
      onError: (err) => {
        console.error('Twilio error', err);
      },
    });

    client.initialize().then(() => {
      clientRef.current = client;
      setReady(true); // React knows it's ready now
    });

    return () => {
      clientRef.current?.destroy();
      clientRef.current = null;
      setReady(false);
    };
  }, [token]);

  const makeCall = (params: Record<string, string>) => {
    console.log({ clientRef });
    clientRef.current?.connect(params);
  };

  const hangUp = () => {
    clientRef.current?.disconnect();
  };

  return {
    makeCall,
    hangUp,
    ready,
  };
};
