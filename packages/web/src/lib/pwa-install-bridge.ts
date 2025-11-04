// pwa-install-bridge.ts (must be the FIRST import in main.tsx)
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}
declare global {
  interface Window {
    __deferredPrompt?: BeforeInstallPromptEvent | null;
  }
  interface WindowEventMap {
    'pwa-install-available': CustomEvent<{
      deferredPrompt: BeforeInstallPromptEvent;
    }>;
  }
}
const isInstalled = () =>
  (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
  // @ts-expect-error iOS Safari
  !!window.navigator?.standalone;

function announceIfAvailable() {
  if (window.__deferredPrompt && !isInstalled()) {
    window.dispatchEvent(
      new CustomEvent('pwa-install-available', {
        detail: { deferredPrompt: window.__deferredPrompt },
      })
    );
  }
}

window.__deferredPrompt = null;

window.addEventListener('load', () => {
  console.log('[PWA] standalone?', isInstalled());
});

window.addEventListener('beforeinstallprompt', (e: Event) => {
  console.log('[PWA] beforeinstallprompt fired');
  e.preventDefault();
  window.__deferredPrompt = e as BeforeInstallPromptEvent;
  console.log('[PWA] dispatched pwa-install-available');
  announceIfAvailable();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') announceIfAvailable();
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] appinstalled');
  window.__deferredPrompt = null;
});
