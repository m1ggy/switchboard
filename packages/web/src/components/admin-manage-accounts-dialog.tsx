import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert, Users } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/lib/trpc';

/**
 * AdminManageAccountsDialog
 * -------------------------
 * Internal tool, server-gated to a single allowed email (superAdminProcedure)
 * — client-side visibility here is UX only, not the security boundary.
 *
 * Lists accounts provisioned by AdminCreateAccountDialog's "New user" flow
 * (permanent, no billing) and lets the admin disable/re-enable them. Disabling
 * blocks API access immediately and blocks future sign-ins; it never touches
 * the account's data, so re-enabling restores it exactly as it was.
 */
export default function AdminManageAccountsDialog() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  const accountsQuery = useQuery({
    ...trpc.companies.listAdminAccounts.queryOptions(),
    enabled: open,
  });

  const { mutateAsync: setAccountActive } = useMutation(
    trpc.companies.setAccountActive.mutationOptions()
  );

  async function toggle(uid: string, nextActive: boolean) {
    setPendingUid(uid);
    try {
      await setAccountActive({ userId: uid, isActive: nextActive });
      await qc.invalidateQueries({
        queryKey: trpc.companies.listAdminAccounts.queryOptions().queryKey,
      });
    } catch (e: any) {
      alert(e?.message || 'Failed to update account.');
    } finally {
      setPendingUid(null);
    }
  }

  const accounts = accountsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="mr-2 h-4 w-4" /> Manage accounts (admin)
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Admin-created accounts</DialogTitle>
          <DialogDescription>
            Accounts created from "Create account (admin)" are permanent and
            never expire. Disable one here when it should stop working —
            re-enable it any time to restore access exactly as it was.
          </DialogDescription>
        </DialogHeader>

        {accountsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No admin-created accounts yet.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {accounts.map((a, i) => (
              <div key={a.uid}>
                {i > 0 ? <Separator className="mb-3" /> : null}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {a.firstName || a.lastName
                          ? `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim()
                          : a.email}
                      </span>
                      <Badge variant={a.isActive ? 'secondary' : 'destructive'}>
                        {a.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.email}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.companies.length === 0
                        ? 'No company provisioned'
                        : a.companies
                            .map(
                              (c) =>
                                `${c.name}${
                                  c.numbers.length
                                    ? ` (${c.numbers
                                        .map((n) => n.number)
                                        .join(', ')})`
                                    : ''
                                }`
                            )
                            .join(', ')}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    {pendingUid === a.uid ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={a.isActive}
                        onCheckedChange={(checked) => {
                          if (
                            checked ||
                            confirm(
                              `Disable ${a.email}? They will be signed out and blocked from the app until you re-enable this.`
                            )
                          ) {
                            toggle(a.uid, checked);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {accountsQuery.isError ? (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <ShieldAlert className="h-4 w-4" />
            {(accountsQuery.error as any)?.message ||
              'Failed to load accounts.'}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
