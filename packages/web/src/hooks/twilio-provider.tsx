import { TwilioVoiceClient } from '@/lib/voice';
import type { Call } from '@twilio/voice-sdk';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

type CallState = 'idle' | 'incoming' | 'connected' | 'disconnected' | 'error';

interface TwilioVoiceContextValue {
  makeCall: (params: Record<string, string>) => void;
  hangUp: () => void;
  callState: CallState;
  ready: boolean;
  incomingCall: Call | null;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
}

const TwilioVoiceContext = createContext<TwilioVoiceContextValue | null>(null);

export function useTwilioVoice() {
  const context = useContext(TwilioVoiceContext);
  if (!context) {
    throw new Error('useTwilioVoice must be used within a TwilioVoiceProvider');
  }
  return context;
}

interface Props {
  token: string;
  children: ReactNode;
}

export const TwilioVoiceProvider = ({ token, children }: Props) => {
  const clientRef = useRef<TwilioVoiceClient | null>(null);
  const [ready, setReady] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);

  useEffect(() => {
    if (!token) return;

    const client = new TwilioVoiceClient({
      token,
      onIncomingCall: (conn) => {
        console.log('📞 Incoming call', conn);
        setIncomingCall(conn);
        setCallState('incoming');
      },
      onDisconnect: () => {
        console.log('📴 Call disconnected');
        setCallState('disconnected');
        setIncomingCall(null);
      },
      onError: (err) => {
        console.error('❌ Twilio error', err);
        setCallState('error');
      },
    });

    client.initialize().then(() => {
      clientRef.current = client;
      setReady(true);
    });

    return () => {
      client.destroy();
      clientRef.current = null;
      setReady(false);
      setCallState('idle');
      setIncomingCall(null);
    };
  }, [token]);

  const makeCall = (params: Record<string, string>) => {
    if (clientRef.current) {
      setCallState('connected');
      clientRef.current.connect(params);
    }
  };

  const hangUp = () => {
    clientRef.current?.disconnect();
    setCallState('disconnected');
  };

  const acceptIncoming = () => {
    if (incomingCall) {
      incomingCall.accept();
      setCallState('connected');
    }
  };

  const rejectIncoming = () => {
    incomingCall?.reject();
    setIncomingCall(null);
    setCallState('disconnected');
  };

  return (
    <TwilioVoiceContext.Provider
      value={{
        makeCall,
        hangUp,
        callState,
        ready,
        incomingCall,
        acceptIncoming,
        rejectIncoming,
      }}
    >
      {children}
    </TwilioVoiceContext.Provider>
  );
};
