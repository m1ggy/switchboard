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

const STORAGE_KEY = 'pwa-install-dialog:seen'; // change if you ever want to show it again

const markSeen = () => {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {}
};

const hasSeen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const isInstalled = () =>
  (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
  // @ts-expect-error iOS Safari
  !!window.navigator?.standalone;

export default function InstallPromptDialog() {
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // If we already showed it once, don't ever open again.
    if (hasSeen()) return;

    // Seed from cached prompt (handles event firing before mount)
    if (!isInstalled() && window.__deferredPrompt) {
      setDeferredPrompt(window.__deferredPrompt);
      setOpen(true);
    }

    const onAvailable = (
      e: CustomEvent<{ deferredPrompt: BeforeInstallPromptEvent }>
    ) => {
      if (hasSeen() || isInstalled()) return; // guard re-opens
      setDeferredPrompt(e.detail.deferredPrompt);
      setOpen(true);
    };

    const onInstalled = () => {
      setOpen(false);
      setDeferredPrompt(null);
      markSeen(); // never show again after install
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

  const handleMaybeLater = () => {
    setOpen(false);
    setDeferredPrompt(null);
    markSeen(); // treat a manual close as "seen"
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    // Whatever the user chooses, consider the dialog "handled" and don't show again.
    await deferredPrompt.userChoice;
    setOpen(false);
    setDeferredPrompt(null);
    markSeen();
  };

  // Extra guard: if someone flips the flag while it's open, close it.
  useEffect(() => {
    if (open && hasSeen()) setOpen(false);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : handleMaybeLater())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install this app?</DialogTitle>
        </DialogHeader>
        <p>You can install this app on your device for a better experience.</p>
        <DialogFooter>
          <Button variant="secondary" onClick={handleMaybeLater}>
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
