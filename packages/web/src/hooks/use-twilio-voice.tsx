import { TwilioVoiceClient } from '@/lib/voice';
import { useEffect, useRef } from 'react';
export const useTwilioVoice = (token: string) => {
  const clientRef = useRef<TwilioVoiceClient | null>(null);

  useEffect(() => {
    if (token) {
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

      client.initialize();
      clientRef.current = client;
    }

    return () => {
      clientRef.current?.destroy();
    };
  }, [token]);

  const makeCall = (params: Record<string, string>) => {
    clientRef.current?.connect(params);
  };

  const hangUp = () => {
    clientRef.current?.disconnect();
  };

  return {
    makeCall,
    hangUp,
  };
};
