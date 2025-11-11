import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, ServerCrash, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * NetworkStatusBanner (compact, non-intrusive)
 *
 * Fixes from v1:
 * - No more full-width translucent overlay (prevents content "bleed" behind the card)
 * - Uses a compact toast-like card pinned to the top-right (or bottom-right)
 * - Solid background (`bg-background`) + border, so underlying UI won't ghost through
 * - Tight typography; single-line title with optional short description
 * - Higher z-index and pointer-events only on the card
 * - Type-safe `navigator.connection` access without ts-ignore
 */

// ---- Types ----
export type NetworkStatusBannerProps = {
  pingUrl?: string;
  intervalMs?: number; // default 15000
  position?: 'top' | 'bottom'; // default "top"
  className?: string;
};

type NetState =
  | { kind: 'online' }
  | { kind: 'offline' }
  | { kind: 'degraded' }
  | { kind: 'reconnected'; at: number };

// ---- utils ----
function getConnection(): NetworkInformation | undefined {
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : undefined;
  return nav?.connection as NetworkInformation | undefined;
}

function getEffectiveType(): string | undefined {
  return getConnection()?.effectiveType;
}

function useInterval(callback: () => void, delay: number | null) {
  const savedRef = useRef(callback);
  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

async function ping(url: string, timeoutMs = 6000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { Accept: 'text/plain,application/json,*/*' },
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// ---- Component ----
export default function NetworkStatusBanner({
  pingUrl,
  intervalMs = 15000,
  position = 'top',
  className,
}: NetworkStatusBannerProps) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastChangedAt, setLastChangedAt] = useState<number>(Date.now());
  const [effectiveType, setEffectiveType] = useState<string | undefined>(
    getEffectiveType()
  );
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [justReconnectedAt, setJustReconnectedAt] = useState<number | null>(
    null
  );

  // Listen for browser network changes
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setLastChangedAt(Date.now());
      setJustReconnectedAt(Date.now());
    }
    function handleOffline() {
      setIsOnline(false);
      setLastChangedAt(Date.now());
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const conn = getConnection();
    const onConnChange = () => setEffectiveType(getEffectiveType());
    conn?.addEventListener?.('change', onConnChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      conn?.removeEventListener?.('change', onConnChange);
    };
  }, []);

  // Optional server ping
  const interval = pingUrl ? intervalMs : null;
  useInterval(() => {
    if (!pingUrl) return;
    ping(pingUrl).then((ok) => {
      setServerOk(ok);
      if (ok && !isOnline) setIsOnline(true);
      if (ok) setJustReconnectedAt((prev) => (prev ? prev : Date.now()));
    });
  }, interval);

  // Auto-hide the transient "reconnected" banner after a short period
  useInterval(
    () => {
      if (justReconnectedAt && Date.now() - justReconnectedAt > 3000) {
        setJustReconnectedAt(null);
      }
    },
    justReconnectedAt ? 500 : null
  );

  const netState: NetState = useMemo(() => {
    if (!isOnline) return { kind: 'offline' };
    if (justReconnectedAt)
      return { kind: 'reconnected', at: justReconnectedAt };
    if (pingUrl && serverOk === false) return { kind: 'degraded' };
    return { kind: 'online' };
  }, [isOnline, justReconnectedAt, pingUrl, serverOk]);

  const sinceText = useMemo(() => {
    const s = Math.floor((Date.now() - lastChangedAt) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  }, [lastChangedAt]);

  const show = netState.kind !== 'online';

  const palette = {
    offline: {
      border: 'border-destructive',
      bg: 'bg-background',
      text: 'text-foreground',
      icon: <WifiOff className="h-4 w-4" />,
      accent: 'bg-destructive',
    },
    degraded: {
      border: 'border-yellow-500',
      bg: 'bg-background',
      text: 'text-foreground',
      icon: <ServerCrash className="h-4 w-4" />,
      accent: 'bg-yellow-500',
    },
    reconnected: {
      border: 'border-emerald-500',
      bg: 'bg-background',
      text: 'text-foreground',
      icon: <Wifi className="h-4 w-4" />,
      accent: 'bg-emerald-500',
    },
  } as const;

  const posClasses = position === 'top' ? 'top-2 right-2' : 'bottom-2 right-2';

  return (
    <div className={`fixed z-[1000] ${posClasses} pointer-events-none`}>
      <AnimatePresence>
        {show && (
          <motion.div
            key={netState.kind}
            initial={{ y: position === 'top' ? -16 : 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: position === 'top' ? -16 : 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="pointer-events-auto"
            role="status"
            aria-live="polite"
          >
            {/* Card */}
            <div
              className={`w-[92vw] max-w-[420px] rounded-2xl border shadow-xl ${
                palette[
                  netState.kind === 'offline'
                    ? 'offline'
                    : netState.kind === 'degraded'
                      ? 'degraded'
                      : 'reconnected'
                ].border
              } ${
                palette[
                  netState.kind === 'offline'
                    ? 'offline'
                    : netState.kind === 'degraded'
                      ? 'degraded'
                      : 'reconnected'
                ].bg
              } ${className ?? ''}`}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Accent bar */}
                <span
                  className={`mt-0.5 h-4 w-1.5 rounded-full ${
                    palette[
                      netState.kind === 'offline'
                        ? 'offline'
                        : netState.kind === 'degraded'
                          ? 'degraded'
                          : 'reconnected'
                    ].accent
                  }`}
                  aria-hidden
                />
                {/* Icon */}
                <div className="mt-0.5 shrink-0">
                  {
                    palette[
                      netState.kind === 'offline'
                        ? 'offline'
                        : netState.kind === 'degraded'
                          ? 'degraded'
                          : 'reconnected'
                    ].icon
                  }
                </div>
                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {netState.kind === 'offline' && <span>You’re offline</span>}
                    {netState.kind === 'degraded' && (
                      <span>Connection issues</span>
                    )}
                    {netState.kind === 'reconnected' && (
                      <span>Back online</span>
                    )}
                    {effectiveType && (
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        · {effectiveType}
                      </span>
                    )}
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      · {sinceText}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {netState.kind === 'offline'
                      ? 'We’ll keep trying to reconnect. Some actions are disabled.'
                      : netState.kind === 'degraded'
                        ? 'You’re online, but the server isn’t reachable. Some data may not save.'
                        : 'Your connection has been restored.'}
                  </p>
                </div>
                {/* Actions */}
                <div className="-mt-1 shrink-0">
                  {(netState.kind === 'offline' ||
                    netState.kind === 'degraded') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => pingUrl && ping(pingUrl).then(setServerOk)}
                      className="h-7"
                    >
                      <RefreshCw className="mr-1 h-4 w-4" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NetworkDot() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-destructive'}`}
        aria-hidden
      />
      <span className="sr-only">{online ? 'Online' : 'Offline'}</span>
    </div>
  );
}
