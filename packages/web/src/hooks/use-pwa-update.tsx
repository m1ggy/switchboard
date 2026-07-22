import { useEffect, useRef, useState } from 'react';
import { isPWAInstalled } from '../lib/pwa-is-installed';
import { registerSW } from '../lib/register-sw';

export function usePWAUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const waitingRegRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!isPWAInstalled()) return;

    registerSW((reg) => {
      waitingRegRef.current = reg;
      setHasUpdate(true);
    });

    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker?.addEventListener(
      'controllerchange',
      onControllerChange
    );
    return () =>
      navigator.serviceWorker?.removeEventListener(
        'controllerchange',
        onControllerChange
      );
  }, []);

  const update = () => {
    const reg = waitingRegRef.current;
    if (!reg?.waiting) {
      console.warn('No waiting service worker to activate; reloading anyway');
      window.location.reload();
      return;
    }
    reg.waiting.postMessage({ type: 'SKIP_WAITING' }); // will trigger activate → clients.claim
  };

  const dismiss = () => setHasUpdate(false);

  return { hasUpdate, update, dismiss };
}
