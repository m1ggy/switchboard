import { Button } from '@/components/ui/button';
import { usePWAUpdate } from '@/hooks/use-pwa-update';
import { Rocket } from 'lucide-react';

export function AppUpdatePrompt() {
  const { hasUpdate, update, dismiss } = usePWAUpdate();
  if (!hasUpdate) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[1000]">
      <div className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2 shadow-xl">
        <Rocket className="h-4 w-4" />
        <span className="text-sm">A new version is available.</span>
        <Button size="sm" onClick={update}>
          Update
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Later
        </Button>
      </div>
    </div>
  );
}
