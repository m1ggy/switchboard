export function isStandaloneDisplay(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

// iOS Safari exposes a non-standard flag when launched from the home screen
export function isIOSStandalone(): boolean {
  // @ts-expect-error: iOS Safari property
  return !!window.navigator?.standalone;
}

export function isPWAInstalled(): boolean {
  return isStandaloneDisplay() || isIOSStandalone();
}
