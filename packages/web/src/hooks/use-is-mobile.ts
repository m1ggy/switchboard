// hooks/use-is-mobile.ts
import { useEffect, useState } from 'react';

export function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof matchMedia === 'undefined')
      return;

    const mq = window.matchMedia(`(max-width: ${breakpointPx - 0.5}px)`);
    const update = () => setIsMobile(mq.matches);

    update(); // initial
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [breakpointPx]);

  return isMobile;
}
