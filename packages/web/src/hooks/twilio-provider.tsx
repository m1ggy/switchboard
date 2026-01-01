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
  useMemo,
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

  // ✅ NEW
  destroyClient: () => void;
  setTokenOverride: (token: string | null) => void;
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
  const { setDialerModalShown, activeNumber } = useMainStore();
  const trpc = useTRPC();

  const clientRef = useRef<TwilioVoiceClient | null>(null);

  const [ready, setReady] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);

  // ✅ NEW: token override for immediate switching
  const [tokenOverride, setTokenOverride] = useState<string | null>(null);

  const identity = useMemo(
    () => (activeNumber?.number ? activeNumber.number : undefined),
    [activeNumber?.number]
  );

  // 🔹 Fetch token for current identity
  const { data: tokenFromQuery, refetch: refetchToken } = useQuery({
    ...trpc.twilio.token.queryOptions({ identity }),
    refetchInterval: 4 * 60 * 10 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    enabled: Boolean(identity),
  });

  const token = tokenOverride ?? tokenFromQuery;

  // ✅ NEW: destroy helper
  const destroyClient = () => {
    try {
      clientRef.current?.disconnect?.();
      clientRef.current?.destroy?.(); // must exist on TwilioVoiceClient
    } catch (err) {
      console.warn('TwilioVoiceProvider.destroyClient() error:', err);
    } finally {
      clientRef.current = null;
      setReady(false);
      setCallState('idle');
      setIncomingCall(null);
      setActiveCall(null);
    }
  };

  // ✅ When identity changes, clear override token so we don't reuse old token
  useEffect(() => {
    setTokenOverride(null);
  }, [identity]);

  // ✅ Build / rebuild Twilio client whenever identity+token changes
  useEffect(() => {
    if (!identity || !token) return;

    let cancelled = false;

    // ✅ cleanly destroy any previous client
    destroyClient();

    const client = new TwilioVoiceClient({
      token,
      identity,
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

        // refetch token in case it's expired
        refetchToken();
      },
    });

    client.initialize().then(() => {
      if (cancelled) return;
      clientRef.current = client;
      setReady(true);
    });

    return () => {
      cancelled = true;
      try {
        client.destroy?.();
      } catch (_) {}
    };
  }, [identity, token, refetchToken]);

  const makeCall = (params: Record<string, string>) => {
    if (!clientRef.current) return;

    clientRef.current.connect(params).then((call) => {
      setCallState('connected');
      setActiveCall(call as unknown as Call);
      setDialerModalShown(false);
    });
  };

  const hangUp = () => {
    clientRef.current?.disconnect();
    setCallState('disconnected');
    setActiveCall(null);
  };

  const acceptIncoming = () => {
    if (!incomingCall) return;
    incomingCall.accept();
    setCallState('connected');
    setActiveCall(incomingCall);
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

        // ✅ NEW
        destroyClient,
        setTokenOverride,
      }}
    >
      {children}
    </TwilioVoiceContext.Provider>
  );
};
