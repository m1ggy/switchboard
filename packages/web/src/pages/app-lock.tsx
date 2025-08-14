// src/components/AppLock.tsx
import { Button } from '@/components/ui/button';
import type { PropsWithChildren } from 'react';

type AppLockProps = PropsWithChildren<{
  endsAt?: string | null;
  onManageBilling?: () => void;
  onLogout?: () => void;
  title?: string;
  message?: string;
}>;

export default function AppLock({
  endsAt,
  onManageBilling,
  onLogout,
  title = 'Subscription Expired',
  message = 'Your account is currently locked. Reactivate to regain access.',
}: AppLockProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/50 backdrop-blur">
      <div className="mx-4 max-w-md w-full rounded-2xl border bg-card p-6 shadow-xl">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {message}
          {endsAt ? (
            <>
              {' '}
              Access ended on{' '}
              <strong>{new Date(endsAt).toLocaleString()}</strong>.
            </>
          ) : null}
        </p>

        <div className="mt-5 flex gap-2">
          <Button className="flex-1" onClick={onManageBilling}>
            Manage billing
          </Button>
          {onLogout && (
            <Button variant="outline" onClick={onLogout}>
              Logout
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
