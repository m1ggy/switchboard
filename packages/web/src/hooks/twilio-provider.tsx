import { primeBrowserAudio } from '@/lib/prime-browser-audio';
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

type CallState =
  | 'idle'
  | 'incoming'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

// Registers this tab as an active call with the OS so mobile browsers don't
// suspend audio playback when the screen locks or the tab backgrounds.
function markMediaSessionActive(label: string) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: label,
      artist: 'Switchboard',
    });
    navigator.mediaSession.playbackState = 'playing';

    // No-op handlers: prevents some mobile browsers from treating this as
    // unmanaged/orphaned media and pausing it in the background.
    for (const action of ['play', 'pause', 'stop'] as const) {
      try {
        navigator.mediaSession.setActionHandler(action, () => {});
      } catch {
        // action not supported by this browser; ignore
      }
    }
  } catch (err) {
    console.warn('Failed to set media session metadata:', err);
  }
}

function clearMediaSessionActive() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

  try {
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
  } catch (err) {
    console.warn('Failed to clear media session metadata:', err);
  }
}

// The SDK's own low-bytes warnings (from its internal StatsMonitor) fire
// whenever RTP audio effectively stops in either direction — the classic
// one-way-audio symptom caused by a mobile carrier NAT rebinding the
// client's port mid-call. This can hit inbound (low-bytes-received: callee
// audio stops reaching us) or outbound (low-bytes-sent: our mic audio stops
// reaching the callee) independently, since each direction's RTP can be
// rebound separately. The SDK only auto-recovers this if `iceConnectionState`
// also reports 'disconnected' (see Call.prototype._onMediaFailure), which
// mobile NAT rebinding usually does NOT trigger — keepalives keep
// succeeding, so ICE never reports disconnected and the SDK does nothing.
// We react to either warning directly and force the same ICE restart the
// SDK would have run, rate-limited so repeated warnings don't hammer it.
//
// This used to be gated to Chrome-family browsers only, since the SDK can't
// verify a restart completed on other engines (notably Safari) and a single
// failed attempt can hard-terminate the call with no retry. But on iOS —
// Safari's engine covers both the browser tab AND the installed PWA — that
// meant one-way audio was never recovered at all: guaranteed-broken audio
// for the rest of the call. That's worse than the small chance of an early
// hangup, so the restart is now attempted on every browser.
const ONE_WAY_AUDIO_WARNINGS = new Set([
  'network-quality-low-bytes-received',
  'network-quality-low-bytes-sent',
]);
const ICE_RESTART_COOLDOWN_MS = 15_000;
const lastIceRestartAttempt = new WeakMap<Call, number>();

function forceIceRestartForOneWayAudio(call: Call) {
  const now = Date.now();
  const last = lastIceRestartAttempt.get(call) ?? 0;
  if (now - last < ICE_RESTART_COOLDOWN_MS) return;
  lastIceRestartAttempt.set(call, now);

  try {
    const mediaHandler = (
      call as unknown as { _mediaHandler?: { iceRestart?: () => void } }
    )._mediaHandler;

    if (typeof mediaHandler?.iceRestart === 'function') {
      console.warn('🔧 Forcing ICE restart to recover one-way audio');
      mediaHandler.iceRestart();
    }
  } catch (err) {
    console.error('Failed to force ICE restart for one-way audio recovery:', err);
  }
}

interface TwilioVoiceContextValue {
  makeCall: (params: Record<string, string>) => Promise<void>;
  hangUp: () => void;
  callState: CallState;
  ready: boolean;
  incomingCall: Call | null;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => void;
  activeCall: Call | null;
  setActiveCall: (call: Call | null) => void;
  clientRef: { current: TwilioVoiceClient | null };
  destroyClient: () => void;
  setTokenOverride: (token: string | null) => void;
  ensureAudioPrimed: () => Promise<void>;
  audioPrimed: boolean;
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
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const lastVisibilityRefreshRef = useRef<number>(0);
  const primePromiseRef = useRef<Promise<void> | null>(null);

  const [ready, setReady] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [tokenOverride, setTokenOverride] = useState<string | null>(null);
  const [audioPrimed, setAudioPrimed] = useState(false);

  const identity = useMemo(
    () => (activeNumber?.number ? activeNumber.number : undefined),
    [activeNumber?.number]
  );

  const { data: tokenFromQuery, refetch: refetchToken } = useQuery({
    ...trpc.twilio.token.queryOptions({ identity }),
    enabled: Boolean(identity),
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
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

  const ensureAudioPrimed = useCallback(async () => {
    if (audioPrimed) return;

    if (primePromiseRef.current) {
      return primePromiseRef.current;
    }

    primePromiseRef.current = (async () => {
      try {
        await primeBrowserAudio();
        setAudioPrimed(true);
      } finally {
        primePromiseRef.current = null;
      }
    })();

    return primePromiseRef.current;
  }, [audioPrimed]);

  const attachCallListeners = useCallback(
    (call: Call, mode: 'incoming' | 'outgoing') => {
      call.addListener('disconnect', () => {
        console.log(`📴 ${mode} call disconnected`);
        clearMediaSessionActive();
        setIncomingCall((prev) => (prev === call ? null : prev));
        setActiveCall((prev) => (prev === call ? null : prev));
        setCallState('disconnected');
      });

      call.addListener('error', (error) => {
        console.error(`❌ ${mode} call error:`, error);
        clearMediaSessionActive();
        setIncomingCall((prev) => (prev === call ? null : prev));
        setActiveCall((prev) => (prev === call ? null : prev));
        setCallState('error');
      });

      call.addListener('cancel', () => {
        console.log(`🚫 ${mode} call canceled`);
        clearMediaSessionActive();
        setIncomingCall((prev) => (prev === call ? null : prev));
        setActiveCall((prev) => (prev === call ? null : prev));
        setCallState('idle');
      });

      call.addListener('accept', () => {
        console.log(`✅ ${mode} call accepted`);
        markMediaSessionActive('Active call');
        setCallState('connected');
        setActiveCall(call);
        setIncomingCall(null);
      });

      // The SDK retries ICE/media reconnection silently for up to ~30s
      // before giving up — surface that window instead of leaving the UI
      // stuck on "connected" with dead audio.
      call.addListener('reconnecting', (error) => {
        console.warn(`⚠️ ${mode} call reconnecting`, error);
        setCallState((prev) => (prev === 'connected' ? 'reconnecting' : prev));
      });

      call.addListener('reconnected', () => {
        console.log(`✅ ${mode} call reconnected`);
        markMediaSessionActive('Active call');
        setCallState((prev) => (prev === 'reconnecting' ? 'connected' : prev));
      });

      // Covers one-way audio: RTP has effectively stopped in one direction,
      // but ICE never reports 'disconnected', so the SDK's own reconnect
      // logic (above) never kicks in on its own.
      call.addListener('warning', (warningName: string) => {
        console.warn(`⚠️ ${mode} call warning:`, warningName);

        if (ONE_WAY_AUDIO_WARNINGS.has(warningName)) {
          setCallState((prev) => (prev === 'connected' ? 'reconnecting' : prev));
          forceIceRestartForOneWayAudio(call);
        }
      });

      call.addListener('warning-cleared', (warningName: string) => {
        console.log(`✅ ${mode} call warning cleared:`, warningName);

        if (ONE_WAY_AUDIO_WARNINGS.has(warningName)) {
          setCallState((prev) => (prev === 'reconnecting' ? 'connected' : prev));
        }
      });
    },
    []
  );

  const refreshTwilioToken = useCallback(async (): Promise<string | null> => {
    if (!identity) return null;

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const result = await refetchToken();
        const newToken = result.data ?? null;

        if (newToken) {
          setTokenOverride(newToken);

          if (clientRef.current) {
            await clientRef.current.updateToken(newToken);
          }
        }

        return newToken;
      } catch (err) {
        console.error('❌ Failed to refresh Twilio token:', err);
        throw err;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [identity, refetchToken]);

  useEffect(() => {
    setTokenOverride(null);
    setAudioPrimed(false);
  }, [identity]);

  useEffect(() => {
    if (!identity || !token) return;

    let cancelled = false;

    const identityChanged = currentIdentityRef.current !== identity;
    const needsNewClient = !clientRef.current || identityChanged;

    if (!needsNewClient) return;

    destroyClient();

    const init = async () => {
      try {
        // Important: prime browser audio before Twilio Device init
        await ensureAudioPrimed();

        if (cancelled) return;

        const client = new TwilioVoiceClient({
          token,
          identity,
          onIncomingCall: (conn) => {
            const call = conn as Call;
            console.log('📞 Incoming call', call);
            attachCallListeners(call, 'incoming');
            setIncomingCall(call);
            setCallState('incoming');
          },
          onDisconnect: () => {
            console.log('📴 Device disconnected');
            setIncomingCall(null);
            setActiveCall(null);
            setCallState('disconnected');
          },
          onError: (err) => {
            console.error('❌ Twilio device error', err);
            setCallState('error');
          },
          onTokenWillExpire: async () => {
            await refreshTwilioToken();
          },
        });

        await client.initialize();

        if (cancelled) {
          try {
            client.destroy();
          } catch {}
          return;
        }

        clientRef.current = client;
        currentIdentityRef.current = identity;
        setReady(true);
        setCallState('idle');
        console.log('✅ Twilio client initialized');
      } catch (err) {
        console.error('❌ Failed to initialize Twilio client:', err);
        if (!cancelled) {
          clientRef.current = null;
          currentIdentityRef.current = undefined;
          setReady(false);
          setCallState('error');
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      try {
        clientRef.current?.destroy();
      } catch {}
    };
  }, [
    identity,
    token,
    destroyClient,
    attachCallListeners,
    refreshTwilioToken,
    ensureAudioPrimed,
  ]);

  useEffect(() => {
    if (!token || !clientRef.current) return;
    if (currentIdentityRef.current !== identity) return;

    let cancelled = false;

    const applyTokenUpdate = async () => {
      try {
        await clientRef.current?.updateToken(token);
        if (!cancelled) {
          console.log('🔄 Twilio token updated in-place');
        }
      } catch (err) {
        console.error('❌ Failed to update Twilio token:', err);
      }
    };

    void applyTokenUpdate();

    return () => {
      cancelled = true;
    };
  }, [token, identity]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      const client = clientRef.current;
      if (!client) return;

      const now = Date.now();
      if (now - lastVisibilityRefreshRef.current < 30_000) {
        return;
      }

      const state = client.getState();

      // nothing to do if device is already registered
      if (state === 'registered' || state === 'registering') {
        return;
      }

      lastVisibilityRefreshRef.current = now;

      try {
        await client.reRegister();

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
  }, [activeCall, incomingCall]);

  const makeCall = useCallback(
    async (params: Record<string, string>) => {
      if (!clientRef.current) {
        console.warn('Cannot make call: Twilio client not ready');
        return;
      }

      try {
        // Fallback: ensure first call is always primed
        await ensureAudioPrimed();

        const call = (await clientRef.current.connect(params)) as Call | null;

        if (!call) {
          throw new Error('Twilio connect returned null');
        }

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
    [attachCallListeners, setDialerModalShown, ensureAudioPrimed]
  );

  const hangUp = useCallback(() => {
    try {
      activeCall?.disconnect?.();
      clientRef.current?.disconnect?.();
    } catch (err) {
      console.warn('Error while hanging up:', err);
    } finally {
      clearMediaSessionActive();
      setActiveCall(null);
      setIncomingCall(null);
      setCallState('disconnected');
    }
  }, [activeCall]);

  const acceptIncoming = useCallback(async () => {
    if (!incomingCall) return;

    try {
      // Fallback for first answered incoming call
      await ensureAudioPrimed();

      incomingCall.accept();
      setActiveCall(incomingCall);
      setIncomingCall(null);
      setCallState('connected');
    } catch (err) {
      console.error('❌ Failed to accept incoming call:', err);
      setCallState('error');
    }
  }, [incomingCall, ensureAudioPrimed]);

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
        ensureAudioPrimed,
        audioPrimed,
      }}
    >
      {children}
    </TwilioVoiceContext.Provider>
  );
};
