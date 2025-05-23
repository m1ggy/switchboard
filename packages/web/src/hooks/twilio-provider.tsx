import useMainStore from '@/lib/store';
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
  activeCall: Call | null;
  setActiveCall: (call: Call | null) => void;
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
  const { setDialerModalShown } = useMainStore();
  const clientRef = useRef<TwilioVoiceClient | null>(null);
  const [ready, setReady] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);

  useEffect(() => {
    if (!token) return;

    const client = new TwilioVoiceClient({
      token,
      onIncomingCall: (conn) => {
        conn.addListener('disconnect', () => {
          console.log('Call disconnected');
          setIncomingCall(null);
          setCallState('idle');
        });
        conn.addListener('error', (error) => {
          console.error('Call error:', error);
          setIncomingCall(null);
          setCallState('idle');
        });
        conn.addListener('cancel', () => {
          console.log('Call was cancelled');
          setIncomingCall(null);
          setCallState('idle');
        });

        console.log('📞 Incoming call', conn);
        setIncomingCall(conn);
        setCallState('incoming');
      },
      onDisconnect: () => {
        console.log('📴 Call disconnected');
        setCallState('disconnected');
        setIncomingCall(null);
        setActiveCall(null);
      },
      onError: (err) => {
        console.error('❌ Twilio error', err);
        setCallState('error');
        setActiveCall(null);
        setIncomingCall(null);
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
      clientRef.current.connect(params).then((call) => {
        setCallState('connected');
        setActiveCall(call as unknown as Call);
        setDialerModalShown(false);
      });
    }
  };

  const hangUp = () => {
    clientRef.current?.disconnect();
    setCallState('disconnected');
    setActiveCall(null);
  };

  const acceptIncoming = () => {
    if (incomingCall) {
      incomingCall.accept();
      setCallState('connected');
      setActiveCall(incomingCall);
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
        activeCall,
        setActiveCall,
      }}
    >
      {children}
    </TwilioVoiceContext.Provider>
  );
};
