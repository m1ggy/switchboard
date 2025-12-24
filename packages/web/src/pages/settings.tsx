// src/app/settings/page.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Loader2,
  Rocket,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import CompanySettingsDialog from '@/components/company-settings-dialog';
import CreateCompanyDialog from '@/components/create-company-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/lib/trpc';
import type { Company } from 'api/types/db';

/* -----------------------------------------------------------------------------
 * Push diagnostics + logging (REPLACES your previous push helpers)
 * ---------------------------------------------------------------------------*/

const DEBUG_PUSH = true; // toggle as needed

function dlog(...args: any[]) {
  if (DEBUG_PUSH) console.log('[push]', ...args);
}
function dwarn(...args: any[]) {
  if (DEBUG_PUSH) console.warn('[push]', ...args);
}
function derr(...args: any[]) {
  if (DEBUG_PUSH) console.error('[push]', ...args);
}

function describeDomError(e: any) {
  const name = e?.name || 'DOMException';
  const msg = e?.message || String(e);
  const code = e && 'code' in e ? e.code : undefined;
  const cause = e?.cause ? String(e.cause) : undefined;

  const hints: Record<string, string> = {
    NotAllowedError: 'Permission was denied or the user blocked notifications.',
    InvalidStateError:
      'Often: existing subscription created with a different VAPID key, or SW scope mismatch.',
    NotSupportedError:
      'Push not supported in this context (iOS needs A2HS; some browsers disable Push).',
    AbortError: 'Operation aborted (navigation/unload during subscribe).',
    SecurityError: 'Requires HTTPS (or localhost).',
    NotReadableError:
      'Could not read key material. Check your VAPID key encoding.',
    OperationError:
      'Underlying operation failed. Check SW registration and key.',
  };

  return { name, msg, code, cause, hint: hints[name] };
}

function isValidBase64Url(s: string) {
  return /^[A-Za-z0-9\-_]+$/.test(s);
}

function base64UrlToUint8Array(base64Url: string) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isPushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window;

async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

async function diagnosePushEnvironment(vapidPublicKey?: string) {
  const info: Record<string, any> = {
    url: location.href,
    origin: location.origin,
    isSecureContext,
    userAgent: navigator.userAgent,
    supports: {
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
      notification: 'Notification' in window,
    },
    permission:
      typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
    iosStandalone: ((): boolean => {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        // @ts-expect-error iOS Safari flag
        !!window.navigator?.standalone;
      return isIOS && isStandalone;
    })(),
    vapidProvided: !!vapidPublicKey,
  };

  if (vapidPublicKey) {
    info.vapid = {
      length: vapidPublicKey.length,
      urlSafe: isValidBase64Url(vapidPublicKey),
    };
    try {
      const key = base64UrlToUint8Array(vapidPublicKey);
      info.vapidDecoded = {
        byteLength: key.byteLength,
        startsWith0x04: key[0] === 0x04, // uncompressed P-256
      };
    } catch (e) {
      info.vapidDecodeError = String(e);
    }
  }

  try {
    if (info.supports.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      info.sw = {
        scope: reg.scope,
        activeState: reg.active?.state,
      };
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        const json = existing.toJSON();
        const url = new URL(json.endpoint!);
        info.existingSubscription = {
          endpointHost: url.host,
          hasKeys: !!json.keys,
          keyLengths: {
            p256dh: json.keys?.p256dh?.length,
            auth: json.keys?.auth?.length,
          },
          expirationTime: (json as any).expirationTime ?? null,
        };
      } else {
        info.existingSubscription = null;
      }
    }
  } catch (e) {
    info.swDiagError = String(e);
  }

  dlog('diagnostics', info);
  return info;
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function getOrCreateSubscription(vapidPublicKey: string) {
  const reg = await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    dlog('existing subscription found', existing);
    return existing;
  }

  if (!vapidPublicKey || !isValidBase64Url(vapidPublicKey)) {
    throw new Error('Invalid VAPID key: not URL-safe base64.');
  }
  const appServerKey = base64UrlToUint8Array(vapidPublicKey);
  if (appServerKey.byteLength !== 65 || appServerKey[0] !== 0x04) {
    dwarn('VAPID key decoded length/format looks off', {
      byteLength: appServerKey.byteLength,
      firstByte: appServerKey[0],
    });
  }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
    dlog('created subscription', sub);
    return sub;
  } catch (e: any) {
    const desc = describeDomError(e);
    derr('subscribe() failed', desc, e);
    if (desc.name === 'InvalidStateError') {
      dwarn(
        'InvalidStateError may mean an old subscription exists under a different VAPID key. ' +
          'Try Reset push (unsubscribe) and ensure the same VAPID key across environments.'
      );
    }
    throw e;
  }
}

async function unsubscribeLocalOnly(): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    dlog('unsubscribe: no existing subscription');
    return false;
  }
  const ok = await sub.unsubscribe().catch((e) => {
    derr('unsubscribe() failed', describeDomError(e));
    return false;
  });
  dlog('unsubscribe local result', ok);
  return ok;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  // @ts-expect-error iOS Safari flag
  !!window.navigator?.standalone;

if (DEBUG_PUSH) {
  window.addEventListener('unhandledrejection', (ev) => {
    derr('Unhandled promise rejection', ev.reason);
  });
}

/* -------------------------------------------------------------------------- */

function Settings() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [companySettingOpen, setCompanySettingOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const { data: companies, isFetching } = useQuery({
    ...trpc.companies.getUserCompanies.queryOptions(),
    refetchOnWindowFocus: false,
  });

  // Fetch user
  const {
    data: userInfo,
    isLoading: isUserLoading,
    isFetching: isUserFetching,
  } = useQuery(trpc.users.getUser.queryOptions());

  const maxCompanies = useMemo(() => {
    switch (userInfo?.selected_plan) {
      case 'starter':
        return 1;
      case 'professional':
        return 3;
      case 'business':
        return 10;
      default:
        return NaN;
    }
  }, [userInfo]);

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
  const { mutateAsync: reactivate, isPending: reactivatePending } = useMutation(
    trpc.subscription.createReactivateCheckout.mutationOptions()
  );

  // Safe accessors (empty for admin)
  const sub = !isAdmin ? billing?.subscription : undefined;

  // Optional: outstanding invoice handling (if your API returns it)
  const outstanding = !isAdmin ? (billing as any)?.outstanding_invoice : null;
  const hasOutstanding = Boolean(outstanding);

  // Helpers
  const isQueryBusy = isUserLoading || (!isAdmin && isBillingLoading);
  const isRefetching = isUserFetching || (!isAdmin && isBillingFetching);

  const companyCount = companies?.length ?? 0;
  const planHasFiniteLimit = Number.isFinite(maxCompanies);
  const remainingSlots = isAdmin
    ? Infinity
    : planHasFiniteLimit
      ? Math.max(0, (maxCompanies as number) - companyCount)
      : 0; // if plan unknown, show 0 remaining to be safe

  const canAddCompany =
    isAdmin || remainingSlots > 0 || (sub && sub.status !== 'canceled');

  /* -----------------------------------------------------------------------
   * Notifications card state
   * ---------------------------------------------------------------------*/
  const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

  const [permission, setPermission] = useState<NotificationPermission>(
    (typeof Notification !== 'undefined' && Notification.permission) ||
      'default'
  );
  const [pushSupported, setPushSupported] = useState<boolean>(false);
  const [hasSub, setHasSub] = useState<boolean>(false);
  const [pushBusy, setPushBusy] = useState<boolean>(false);

  // TRPC mutations for subscribe/unsubscribe/test
  const subscribePushMutation = useMutation(
    trpc.notifications.subscribePush.mutationOptions()
  );
  const unsubscribePushMutation = useMutation(
    trpc.notifications.unsubscribePush.mutationOptions()
  );
  const sendTestPushMutation = useMutation(
    trpc.notifications.sendTestPush.mutationOptions?.() ??
      // fallback if you don’t expose sendTestPush in some envs
      ({ mutationFn: async () => ({ ok: false }) } as any)
  );

  useEffect(() => {
    setPushSupported(isPushSupported());
    // check existing sub on mount
    if (isPushSupported()) {
      getExistingSubscription().then((s) => setHasSub(!!s));
    }
    // record current permission
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const onEnablePush = async () => {
    if (!isPushSupported()) {
      alert('Push is not supported in this browser.');
      dlog('support check failed');
      return;
    }
    if (!VAPID) {
      alert('VAPID public key is missing on the client.');
      dwarn('missing VAPID public key (VITE_VAPID_PUBLIC_KEY)');
      return;
    }

    // iOS: require A2HS to subscribe
    if (isIOS() && !isStandalone()) {
      alert(
        'On iOS, install the app to your home screen to enable push notifications.'
      );
      dwarn('iOS not standalone');
      return;
    }

    setPushBusy(true);
    try {
      await diagnosePushEnvironment(VAPID);

      const perm = await ensureNotificationPermission();
      dlog('permission result', perm);
      setPermission(perm);
      if (perm !== 'granted') {
        alert('Please allow notifications to enable push.');
        return;
      }

      const sub = await getOrCreateSubscription(VAPID);
      const json = sub.toJSON();
      dlog('subscription json', json);

      await subscribePushMutation.mutateAsync({
        endpoint: json.endpoint!,
        expirationTime: (json as any).expirationTime ?? null,
        keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
      });

      setHasSub(true);
      dlog('subscribePush: server ok');
    } catch (e: any) {
      const desc = describeDomError(e);
      derr('Enable push failed:', desc, e);
      alert(
        `${desc.name}: ${desc.msg}${desc.hint ? `\n\nHint: ${desc.hint}` : ''}`
      );
    } finally {
      setPushBusy(false);
    }
  };

  const onDisablePush = async () => {
    setPushBusy(true);
    try {
      await diagnosePushEnvironment();
      const sub = await getExistingSubscription();
      if (sub) {
        // Notify server first (so it can delete by endpoint), then local unsubscribe
        await unsubscribePushMutation.mutateAsync({ endpoint: sub.endpoint });
        await unsubscribeLocalOnly();
        setHasSub(false);
        dlog('push disabled');
      } else {
        setHasSub(false);
        dlog('no sub to disable');
      }
    } catch (e: any) {
      derr('Disable push failed', describeDomError(e), e);
      alert(e?.message || 'Failed to disable push.');
    } finally {
      setPushBusy(false);
    }
  };

  // Optional: recovery helper for mismatched VAPID or stuck subs
  const resetPush = async () => {
    setPushBusy(true);
    try {
      const sub = await getExistingSubscription();
      if (sub) {
        await unsubscribePushMutation.mutateAsync({ endpoint: sub.endpoint });
        await unsubscribeLocalOnly();
      }
      // slight delay helps some browsers fully release the old sub
      await new Promise((r) => setTimeout(r, 250));
      setHasSub(false);
      alert('Push reset complete. Try enabling again.');
      dlog('reset push complete');
    } catch (e) {
      derr('resetPush failed', describeDomError(e), e);
      alert('Reset failed. See console for details.');
    } finally {
      setPushBusy(false);
    }
  };

  const onSendTest = async () => {
    try {
      await sendTestPushMutation.mutateAsync({
        title: 'Hello from Switchboard',
        body: 'If you can read this, push works!',
        url: '/dashboard/inbox',
      });
      alert('Test push sent. Check your system notifications.');
    } catch (e: any) {
      console.error('Test push failed:', e);
      alert(e?.message || 'Failed to send test push.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* NOTIFICATIONS CARD (UPDATED) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <div>
              Browser support:{' '}
              <strong>{pushSupported ? 'Supported' : 'Not supported'}</strong>
            </div>
            <div>
              Permission: <strong className="uppercase">{permission}</strong>
            </div>
            <div>
              Subscription:{' '}
              <strong>{hasSub ? 'Enabled' : 'Not enabled'}</strong>
            </div>
            {isIOS() && !isStandalone() && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                On iOS, push notifications require installing the app to your
                Home Screen. Open this site in Safari, tap{' '}
                <strong>Share</strong> → <strong>Add to Home Screen</strong>,
                then open the installed app.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {!hasSub ? (
              <Button
                onClick={onEnablePush}
                disabled={pushBusy || !pushSupported || permission === 'denied'}
              >
                {pushBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="mr-2 h-4 w-4" />
                )}
                Enable push
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={onDisablePush}
                disabled={pushBusy}
              >
                {pushBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BellOff className="mr-2 h-4 w-4" />
                )}
                Disable push
              </Button>
            )}

            <Button
              variant="outline"
              onClick={onSendTest}
              // disabled={!hasSub || pushBusy}
              title={!hasSub ? 'Enable push first' : 'Send a test notification'}
            >
              <Rocket className="mr-2 h-4 w-4" />
              Send test
            </Button>

            <Button
              variant="ghost"
              onClick={resetPush}
              disabled={pushBusy}
              title="Unsubscribe locally and on server; useful if VAPID or scope changed"
            >
              Reset push
            </Button>
          </div>
        </CardContent>
      </Card>

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
                    onClick={() =>
                      reactivate({
                        successUrl:
                          window.location.origin +
                          '/dashboard/settings?checkout=success',
                        cancelUrl:
                          window.location.origin +
                          '/dashboard/settings?checkout=cancel',
                        allowPromotionCodes: true,
                      }).then((data) => {
                        if (data.ok) {
                          window.location.href = data.url;
                        }
                      })
                    }
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

      {/* COMPANIES CARD */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Companies
            <span className="text-xs rounded bg-muted px-2 py-0.5">
              {isAdmin
                ? `${companyCount} / ∞`
                : planHasFiniteLimit
                  ? `${companyCount} / ${maxCompanies}`
                  : `${companyCount}`}
            </span>
          </CardTitle>

          {isFetching && (
            <span className="inline-flex items-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            </span>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Loading state */}
          {isFetching ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              {/* Capacity notice */}
              {isAdmin ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Admin accounts can create unlimited companies.
                </div>
              ) : planHasFiniteLimit ? (
                <div
                  className={
                    'rounded-md p-3 text-sm ' +
                    (canAddCompany
                      ? 'border bg-muted/40 text-muted-foreground'
                      : 'border border-amber-300 bg-amber-50 text-amber-900')
                  }
                >
                  {canAddCompany ? (
                    <>
                      You can add{' '}
                      <strong>
                        {remainingSlots} more compan
                        {remainingSlots === 1 ? 'y' : 'ies'}
                      </strong>{' '}
                      on your current plan.
                    </>
                  ) : (
                    <>
                      You’ve reached your plan’s company limit (
                      <strong>{maxCompanies}</strong>). Remove a company or
                      upgrade your plan to add more.
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  We couldn’t determine your plan’s company limit.
                </div>
              )}

              {companyCount ? (
                <ul className="divide-y rounded-md border">
                  {companies!.map((c: any) => (
                    <li
                      key={c.id}
                      className="p-3 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {c.name ?? 'Untitled company'}
                        </div>
                        {c.domain && (
                          <div className="text-xs text-muted-foreground truncate">
                            {c.domain}
                          </div>
                        )}
                      </div>
                      <div>
                        <Button
                          variant={'outline'}
                          onClick={() => {
                            setSelectedCompany(c);
                            setCompanySettingOpen(true);
                          }}
                        >
                          <Settings2 />
                          Settings
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">
                  You don’t have any companies yet.
                </div>
              )}

              <div className="pt-2">
                {canAddCompany ? <CreateCompanyDialog /> : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CompanySettingsDialog
        open={companySettingOpen}
        setOpen={setCompanySettingOpen}
        company={selectedCompany}
      />
    </div>
  );
}

export default Settings;
