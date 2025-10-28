// hooks/use-vh-unit.ts
import { useMemo } from 'react';

export function useMobileVh(max = 55) {
  // returns '55svh' if supported, else '55vh'
  return useMemo(() => {
    if (
      typeof window === 'undefined' ||
      typeof CSS === 'undefined' ||
      !CSS.supports
    ) {
      return `${max}vh`;
    }
    return CSS.supports('height', '1svh') ? `${max}svh` : `${max}vh`;
  }, [max]);
}
