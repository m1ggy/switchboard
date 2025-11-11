import { useEffect, useRef, useState } from 'react';
import { registerSW } from '../lib/register-sw';

export function usePWAUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const waitingRegRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
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
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' }); // will trigger activate → clients.claim
  };

  const dismiss = () => setHasUpdate(false);

  return { hasUpdate, update, dismiss };
}
