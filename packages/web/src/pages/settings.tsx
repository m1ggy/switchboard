// src/app/settings/page.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/lib/trpc';

function Settings() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  // Fetch user
  const {
    data: userInfo,
    isLoading: isUserLoading,
    isFetching: isUserFetching,
  } = useQuery(trpc.users.getUser.queryOptions());

  // Derive admin flag from user record
  const isAdmin = useMemo(
    () => userInfo?.stripe_subscription_id === 'ADMIN',
    [userInfo?.stripe_subscription_id]
  );

  // Fetch billing summary ONLY for non-admins
  const {
    data: billing,
    isLoading: isBillingLoading,
    isFetching: isBillingFetching,
  } = useQuery({
    ...trpc.subscription.getBillingSummary.queryOptions(),
    enabled: !isAdmin, // skip Stripe calls for admin
  });

  // Mutations
  const [confirmImmediate, setConfirmImmediate] = useState(false);

  const { mutate: cancelAtPeriodEnd, isPending: cancelAtPeriodEndPending } =
    useMutation({
      ...trpc.subscription.cancelSubscription.mutationOptions(),
      onSuccess: () =>
        qc.invalidateQueries({
          queryKey: trpc.subscription.getBillingSummary.queryOptions().queryKey,
        }),
    });

  const { mutate: cancelImmediately, isPending: cancelImmediatelyPending } =
    useMutation({
      ...trpc.subscription.cancelSubscription.mutationOptions(),
      onSuccess: () =>
        qc.invalidateQueries({
          queryKey: trpc.subscription.getBillingSummary.queryOptions().queryKey,
        }),
    });

  // NEW: resume (when cancel_at_period_end = true)
  const { mutate: resumeSubscription, isPending: resumePending } = useMutation({
    ...trpc.subscription.resumeSubscription.mutationOptions?.(),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: trpc.subscription.getBillingSummary.queryOptions().queryKey,
      }),
  });

  // NEW: reactivate (when fully canceled / no sub) -> opens Stripe Checkout
  const { mutate: reactivate, isPending: reactivatePending } = useMutation({
    mutationFn: async () =>
      trpc.subscription.createReactivateCheckout.mutate({
        // you can pass a specific priceId here if you allow plan selection
        successUrl: window.location.origin + '/settings?checkout=success',
        cancelUrl: window.location.origin + '/settings?checkout=cancel',
        allowPromotionCodes: true,
      }),
    onSuccess: ({ url }: { url: string }) => {
      if (url) window.location.href = url;
    },
  });

  // Safe accessors (empty for admin)
  const sub = !isAdmin ? billing?.subscription : undefined;
  const defaultPm = !isAdmin
    ? billing?.payment_methods?.find((p) => p.is_default)
    : undefined;

  // Optional: outstanding invoice handling (if your API returns it)
  const outstanding = !isAdmin ? (billing as any)?.outstanding_invoice : null;
  const hasOutstanding = Boolean(outstanding);

  // Helpers
  const isQueryBusy = isUserLoading || (!isAdmin && isBillingLoading);
  const isRefetching = isUserFetching || (!isAdmin && isBillingFetching);

  return (
    <div className="p-6 space-y-6">
      {/* SUBSCRIPTION CARD */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Subscription
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-xs rounded bg-muted px-2 py-0.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin
              </span>
            )}
          </CardTitle>
          {isRefetching && (
            <span className="inline-flex items-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            </span>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Loading skeletons */}
          {isQueryBusy ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-64" />
              {!isAdmin && (
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-9 w-44" />
                  <Skeleton className="h-9 w-40" />
                </div>
              )}
            </div>
          ) : isAdmin ? (
            // Admin view: no Stripe bindings
            <div className="space-y-2 text-sm">
              <div>
                Plan: <strong>—</strong>
              </div>
              <div>
                Status: <strong className="uppercase">ADMIN</strong>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
                This is an admin account. Billing, plans, and subscriptions are
                not applicable.
              </div>
            </div>
          ) : (
            // Normal (non-admin) view
            <>
              <div className="text-sm space-y-1.5">
                <div>
                  Plan: <strong>{sub?.plan_name ?? '—'}</strong>
                </div>
                <div>
                  Status:{' '}
                  <strong className="uppercase">{sub?.status ?? '—'}</strong>
                </div>
                {sub?.current_period_end && (
                  <div>
                    Renews / Ends:{' '}
                    <strong>
                      {new Date(sub.current_period_end).toLocaleString()}
                    </strong>
                  </div>
                )}
                {sub?.cancel_at_period_end && (
                  <div className="text-amber-600">
                    Cancellation scheduled at period end.
                  </div>
                )}
              </div>

              {/* Optional: outstanding invoice notice */}
              {hasOutstanding && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  You have an outstanding invoice of{' '}
                  <strong>
                    {new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: (
                        (outstanding.currency ?? 'usd') as string
                      ).toUpperCase(),
                    }).format((outstanding.amount_due ?? 0) / 100)}
                  </strong>
                  . Please pay before changing your subscription.
                  {outstanding.hosted_invoice_url && (
                    <a
                      href={outstanding.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 underline"
                    >
                      Pay invoice
                    </a>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {/* Resume if cancel is scheduled */}
                {sub?.cancel_at_period_end && sub.status !== 'canceled' && (
                  <Button
                    variant="default"
                    disabled={resumePending || hasOutstanding}
                    onClick={() => resumeSubscription()}
                  >
                    {resumePending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Resume subscription
                  </Button>
                )}

                {/* Reactivate if canceled or there is no subscription */}
                {(!sub || sub.status === 'canceled') && (
                  <Button
                    variant="default"
                    disabled={reactivatePending || hasOutstanding}
                    onClick={() => reactivate()}
                  >
                    {reactivatePending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Reactivate
                  </Button>
                )}

                {/* Cancel at period end for active subs */}
                {sub && sub.status !== 'canceled' && (
                  <Button
                    variant="secondary"
                    disabled={
                      hasOutstanding ||
                      sub.cancel_at_period_end ||
                      sub.status === 'canceled' ||
                      cancelAtPeriodEndPending
                    }
                    onClick={() => cancelAtPeriodEnd({ immediately: false })}
                  >
                    {cancelAtPeriodEndPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {cancelAtPeriodEndPending
                      ? 'Scheduling…'
                      : 'Cancel Subscription'}
                  </Button>
                )}
              </div>

              {confirmImmediate && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm">
                    Are you sure you want to cancel immediately? This will end
                    access right away.
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => {
                        cancelImmediately({ immediately: true });
                        setConfirmImmediate(false);
                      }}
                    >
                      {cancelImmediatelyPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Yes, cancel now
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmImmediate(false)}
                    >
                      Keep subscription
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* PAYMENT METHOD CARD */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payment Method</CardTitle>
          {isRefetching && !isAdmin && (
            <span className="inline-flex items-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            </span>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {isQueryBusy ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-40" />
              {!isAdmin && (
                <div className="pt-2">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-52 mt-1" />
                </div>
              )}
            </div>
          ) : isAdmin ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              Admin accounts do not have payment methods.
            </div>
          ) : (
            <>
              {defaultPm ? (
                <div className="text-sm">
                  <div>
                    Default:{' '}
                    <strong className="uppercase">{defaultPm.brand}</strong>{' '}
                    •••• {defaultPm.last4}
                  </div>
                  <div>
                    Exp: {defaultPm.exp_month}/{defaultPm.exp_year}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No default payment method on file.
                </div>
              )}

              {billing?.payment_methods?.length ? (
                <div className="text-sm">
                  <div className="font-medium mb-1">All cards</div>
                  <ul className="list-disc ml-5 space-y-1">
                    {billing.payment_methods.map((pm) => (
                      <li key={pm.id}>
                        <span className="uppercase">{pm.brand}</span> ••••{' '}
                        {pm.last4} (exp {pm.exp_month}/{pm.exp_year})
                        {pm.is_default && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-muted">
                            Default
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Settings;
