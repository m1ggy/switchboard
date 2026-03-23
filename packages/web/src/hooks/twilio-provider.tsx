import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { TwilioVoiceClient } from '@/lib/voice';
import { useQuery } from '@tanstack/react-query';
import type { Call } from '@twilio/voice-sdk';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type CallState = 'idle' | 'incoming' | 'connected' | 'disconnected' | 'error';

interface TwilioVoiceContextValue {
  makeCall: (params: Record<string, string>) => Promise<void>;
  hangUp: () => void;
  callState: CallState;
  ready: boolean;
  incomingCall: Call | null;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  activeCall: Call | null;
  setActiveCall: (call: Call | null) => void;
  clientRef: { current: TwilioVoiceClient | null };
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
  const currentIdentityRef = useRef<string | undefined>(undefined);

  const [ready, setReady] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [tokenOverride, setTokenOverride] = useState<string | null>(null);

  const identity = useMemo(
    () => (activeNumber?.number ? activeNumber.number : undefined),
    [activeNumber?.number]
  );

  const { data: tokenFromQuery, refetch: refetchToken } = useQuery({
    ...trpc.twilio.token.queryOptions({ identity }),
    refetchInterval: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    enabled: Boolean(identity),
  });

  const token = tokenOverride ?? tokenFromQuery;

  const resetState = useCallback(() => {
    setReady(false);
    setCallState('idle');
    setIncomingCall(null);
    setActiveCall(null);
  }, []);

  const destroyClient = useCallback(() => {
    try {
      clientRef.current?.disconnect?.();
      clientRef.current?.destroy?.();
    } catch (err) {
      console.warn('TwilioVoiceProvider.destroyClient() error:', err);
    } finally {
      clientRef.current = null;
      currentIdentityRef.current = undefined;
      resetState();
    }
  }, [resetState]);

  const attachCallListeners = useCallback(
    (call: Call, mode: 'incoming' | 'outgoing') => {
      call.addListener('disconnect', () => {
        console.log(`📴 ${mode} call disconnected`);
        setIncomingCall((prev) => (prev === call ? null : prev));
        setActiveCall((prev) => (prev === call ? null : prev));
        setCallState('disconnected');
      });

      call.addListener('error', (error) => {
        console.error(`❌ ${mode} call error:`, error);
        setIncomingCall((prev) => (prev === call ? null : prev));
        setActiveCall((prev) => (prev === call ? null : prev));
        setCallState('error');
      });

      call.addListener('cancel', () => {
        console.log(`🚫 ${mode} call canceled`);
        setIncomingCall((prev) => (prev === call ? null : prev));
        setActiveCall((prev) => (prev === call ? null : prev));
        setCallState('idle');
      });

      call.addListener('accept', () => {
        console.log(`✅ ${mode} call accepted`);
        setCallState('connected');
        setActiveCall(call);
        setIncomingCall(null);
      });
    },
    []
  );

  useEffect(() => {
    setTokenOverride(null);
  }, [identity]);

  // Create client only when identity changes
  useEffect(() => {
    if (!identity || !token) return;

    let cancelled = false;

    // only rebuild if identity changed or no client exists
    const identityChanged = currentIdentityRef.current !== identity;
    const needsNewClient = !clientRef.current || identityChanged;

    if (!needsNewClient) return;

    destroyClient();

    const client = new TwilioVoiceClient({
      token,
      identity,
      onIncomingCall: (conn) => {
        console.log('📞 Incoming call', conn);
        attachCallListeners(conn as Call, 'incoming');
        setIncomingCall(conn as Call);
        setCallState('incoming');
      },

      onDisconnect: () => {
        console.log('📴 Device disconnected');
        setIncomingCall(null);
        setActiveCall(null);
        setCallState('disconnected');
      },

      onError: async (err) => {
        console.error('❌ Twilio device error', err);
        setCallState('error');
        setIncomingCall(null);
        setActiveCall(null);

        try {
          const result = await refetchToken();
          const newToken = result.data;
          if (newToken && clientRef.current?.updateToken) {
            await clientRef.current.updateToken(newToken);
            console.log('🔄 Token refreshed after device error');
            setCallState('idle');
          }
        } catch (refreshErr) {
          console.error(
            '❌ Failed to refresh token after device error:',
            refreshErr
          );
        }
      },
    });

    client
      .initialize()
      .then(() => {
        if (cancelled) {
          try {
            client.destroy?.();
          } catch {}
          return;
        }

        clientRef.current = client;
        currentIdentityRef.current = identity;
        setReady(true);
        setCallState('idle');
        console.log('✅ Twilio client initialized');
      })
      .catch((err) => {
        console.error('❌ Failed to initialize Twilio client:', err);
        if (!cancelled) {
          clientRef.current = null;
          currentIdentityRef.current = undefined;
          setReady(false);
          setCallState('error');
        }
      });

    return () => {
      cancelled = true;
      try {
        client.destroy?.();
      } catch {}
    };
  }, [identity, token, destroyClient, attachCallListeners, refetchToken]);

  // Update token in-place instead of rebuilding client
  useEffect(() => {
    if (!token || !clientRef.current) return;
    if (currentIdentityRef.current !== identity) return;
    if (!clientRef.current.updateToken) return;

    let cancelled = false;

    const applyTokenUpdate = async () => {
      try {
        await clientRef.current?.updateToken?.(token);
        if (!cancelled) {
          console.log('🔄 Twilio token updated in-place');
        }
      } catch (err) {
        console.error('❌ Failed to update Twilio token:', err);
      }
    };

    applyTokenUpdate();

    return () => {
      cancelled = true;
    };
  }, [token, identity]);

  // Recover when returning to the page on mobile
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!clientRef.current) return;

      try {
        const result = await refetchToken();
        const newToken = result.data;

        if (newToken && clientRef.current.updateToken) {
          await clientRef.current.updateToken(newToken);
          console.log('🔄 Token refreshed on visibility change');
        }

        // optional re-register/reinitialize if your wrapper supports it
        if (clientRef.current.initialize) {
          await clientRef.current.initialize();
          console.log('♻️ Twilio client re-initialized on visibility change');
        }

        setReady(true);
        if (!activeCall && !incomingCall) {
          setCallState('idle');
        }
      } catch (err) {
        console.error(
          '❌ Failed to recover Twilio client after visibility change:',
          err
        );
        setReady(false);
        setCallState('error');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetchToken, activeCall, incomingCall]);

  const makeCall = useCallback(
    async (params: Record<string, string>) => {
      if (!clientRef.current) {
        console.warn('Cannot make call: Twilio client not ready');
        return;
      }

      try {
        setCallState('idle');

        const call = (await clientRef.current.connect(params)) as Call;
        attachCallListeners(call, 'outgoing');

        setActiveCall(call);
        setIncomingCall(null);
        setCallState('connected');
        setDialerModalShown(false);

        console.log('📞 Outgoing call started');
      } catch (err) {
        console.error('❌ Failed to make outgoing call:', err);
        setActiveCall(null);
        setCallState('error');
      }
    },
    [attachCallListeners, setDialerModalShown]
  );

  const hangUp = useCallback(() => {
    try {
      activeCall?.disconnect?.();
      clientRef.current?.disconnect?.();
    } catch (err) {
      console.warn('Error while hanging up:', err);
    } finally {
      setActiveCall(null);
      setIncomingCall(null);
      setCallState('disconnected');
    }
  }, [activeCall]);

  const acceptIncoming = useCallback(() => {
    if (!incomingCall) return;

    try {
      attachCallListeners(incomingCall, 'incoming');
      incomingCall.accept();
      setActiveCall(incomingCall);
      setIncomingCall(null);
      setCallState('connected');
    } catch (err) {
      console.error('❌ Failed to accept incoming call:', err);
      setCallState('error');
    }
  }, [incomingCall, attachCallListeners]);

  const rejectIncoming = useCallback(() => {
    try {
      incomingCall?.reject();
    } catch (err) {
      console.error('❌ Failed to reject incoming call:', err);
    } finally {
      setIncomingCall(null);
      setActiveCall(null);
      setCallState('disconnected');
    }
  }, [incomingCall]);

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
        destroyClient,
        setTokenOverride,
      }}
    >
      {children}
    </TwilioVoiceContext.Provider>
  );
};
