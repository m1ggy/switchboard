import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { TwilioVoiceClient } from '@/lib/voice';
import { useQuery } from '@tanstack/react-query';
import type { Call } from '@twilio/voice-sdk';
import {
  createContext,
  type PropsWithChildren,
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
  clientRef: { current: TwilioVoiceClient | null };
}

const TwilioVoiceContext = createContext<TwilioVoiceContextValue | null>(null);

export function useTwilioVoice() {
  const context = useContext(TwilioVoiceContext);
  if (!context) {
    throw new Error('useTwilioVoice must be used within a TwilioVoiceProvider');
  }
  return context;
}

export const TwilioVoiceProvider = ({ children }: PropsWithChildren) => {
  const { setDialerModalShown } = useMainStore();
  const clientRef = useRef<TwilioVoiceClient | null>(null);
  const [ready, setReady] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const { activeNumber } = useMainStore();
  const trpc = useTRPC();

  const { data: token, refetch: refetchToken } = useQuery({
    ...trpc.twilio.token.queryOptions({ identity: activeNumber?.number }),
    refetchInterval: 4 * 60 * 10 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    enabled:
      Boolean(activeNumber) &&
      //@ts-ignore
      !clientRef.current?.activeConnection?.(),
  });

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
        refetchToken();
      },
      identity: activeNumber?.number as string,
    });

    client.initialize().then(() => {
      if (clientRef.current) clientRef.current?.destroy?.();

      clientRef.current = client;
      setReady(true);
    });
  }, [token, refetchToken, activeNumber]);

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
        clientRef,
      }}
    >
      {children}
    </TwilioVoiceContext.Provider>
  );
};
