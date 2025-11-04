// InstallPromptDialog.tsx
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEffect, useState } from 'react';

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

export default function InstallPromptDialog() {
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Seed from cached prompt (handles “event fired before component mounted”)
    if (!isInstalled() && window.__deferredPrompt) {
      console.log('[PWA] Dialog seeding from cached prompt');
      setDeferredPrompt(window.__deferredPrompt);
      setOpen(true);
    }

    const onAvailable = (
      e: CustomEvent<{ deferredPrompt: BeforeInstallPromptEvent }>
    ) => {
      console.log('[PWA] Dialog received pwa-install-available');
      setDeferredPrompt(e.detail.deferredPrompt);
      if (!isInstalled()) setOpen(true);
    };

    const onInstalled = () => {
      console.log('[PWA] Dialog detected appinstalled');
      setOpen(false);
      setDeferredPrompt(null);
    };

    window.addEventListener(
      'pwa-install-available',
      onAvailable as EventListener
    );
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener(
        'pwa-install-available',
        onAvailable as EventListener
      );
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setOpen(false);
    setDeferredPrompt(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install this app?</DialogTitle>
        </DialogHeader>
        <p>You can install this app on your device for a better experience.</p>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Maybe later
          </Button>
          <Button
            onClick={handleInstall}
            disabled={!deferredPrompt}
            data-testid="install-confirm"
          >
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
