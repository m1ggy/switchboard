import { useAuth } from '@/hooks/auth-provider';
import { auth } from '@/lib/firebase';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { signOut } from 'firebase/auth';
import { AlertTriangle, Bell, Loader2, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import AudioSettingsHoverCard from './audio-settings-dialog';
import Notifications from './notifications';
import { Button } from './ui/button';
import { NotificationBadge } from './ui/notification-badge';
import { SidebarTrigger } from './ui/sidebar';
import TooltipStandalone from './ui/tooltip-standalone';

type HeaderProps = {
  isLoggedIn?: boolean;
};

const pagesMap: Record<string, string> = {
  '/dashboard/inbox': 'Inbox',
  '/dashboard/drafts': 'Drafts',
  '/dashboard/sent': 'Sent Messages',
  '/dashboard/call-history': 'Call History',
  '/dashboard/add-contact': 'Add Contact',
  '/dashboard/all-contacts': 'All Contacts',
  '/dashboard': 'Dashboard',
};

// --- helpers ---
function formatDate(d?: string | Date | null) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
function daysUntil(d?: string | Date | null) {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function Header({ isLoggedIn }: HeaderProps) {
  const trpc = useTRPC();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const authContext = useAuth();

  const { data: unreadCount } = useQuery(
    trpc.notifications.getUnreadNotificationsCount.queryOptions()
  );
  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());

  // Billing summary (for outstanding invoice / banner CTAs); skip for ADMIN
  const isAdmin = userInfo?.stripe_subscription_id === 'ADMIN';
  const { data: billing } = useQuery({
    ...trpc.subscription.getBillingSummary.queryOptions(),
    enabled: Boolean(isLoggedIn && !isAdmin && userInfo?.stripe_customer_id),
  });
  const outstanding = (billing as any)?.outstanding_invoice ?? null;
  const hasOutstanding = Boolean(outstanding?.hosted_invoice_url);

  /// Stripe-like statuses you store in DB via webhooks or subscription flows
  const subStatus = (userInfo?.subscription_status ?? 'active') as
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'unpaid'
    | 'incomplete'
    | 'incomplete_expired'
    | 'canceled'
    | undefined;

  const planEndsAt = userInfo?.plan_ends_at
    ? new Date(userInfo.plan_ends_at)
    : null;
  const daysLeft = daysUntil(planEndsAt);

  const cancelAtPeriodEndFlag =
    (userInfo as any)?.cancel_at_period_end === true ||
    (!!planEndsAt &&
      planEndsAt.getTime() > Date.now() &&
      subStatus !== 'canceled' &&
      subStatus !== 'active');

  const hasBillingIssue =
    subStatus === 'past_due' ||
    subStatus === 'unpaid' ||
    subStatus === 'incomplete' ||
    subStatus === 'incomplete_expired';

  const isEnded =
    subStatus === 'canceled' &&
    (!planEndsAt || planEndsAt.getTime() <= Date.now());

  const showBanner =
    isLoggedIn &&
    (hasBillingIssue || cancelAtPeriodEndFlag || isEnded || hasOutstanding);

  // 🔹 Reactivate (Checkout) mutation — same style you used in Settings
  const { mutateAsync: reactivate, isPending: reactivatePending } = useMutation(
    trpc.subscription.createReactivateCheckout.mutationOptions()
  );

  const handleReactivate = async () => {
    const data = await reactivate({
      successUrl:
        window.location.origin + '/dashboard/settings?checkout=success',
      cancelUrl: window.location.origin + '/dashboard/settings?checkout=cancel',
      allowPromotionCodes: true,
    });
    if ((data as any)?.ok) {
      window.location.href = (data as any).url;
    }
  };

  // 🔹 Only show Reactivate when fully ended or incomplete_expired, and no outstanding invoice
  const shouldShowReactivate =
    !isAdmin &&
    !hasOutstanding &&
    (isEnded || subStatus === 'incomplete_expired');

  // Banner content
  let bannerClass = 'bg-black text-white';
  let title = '';
  let message = '';
  let showEnd = false;

  if (cancelAtPeriodEndFlag) {
    bannerClass = 'bg-amber-500 text-white';
    title = 'Your subscription will end soon';
    message = planEndsAt
      ? `Access ends on ${formatDate(planEndsAt)}${
          daysLeft && daysLeft > 0
            ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`
            : ''
        }. You can resume your plan anytime.`
      : 'Your plan is set to cancel at the period end.';
    showEnd = Boolean(planEndsAt);
  } else {
    switch (subStatus) {
      case 'past_due':
        bannerClass = 'bg-red-600 text-white';
        title = 'Payment issue: Your subscription is past due';
        message = 'Please update your payment method to avoid interruption.';
        break;
      case 'unpaid':
        bannerClass = 'bg-red-700 text-white';
        title = 'Payment failed: Subscription is unpaid';
        message = 'Update your card to restore service.';
        break;
      case 'incomplete':
      case 'incomplete_expired':
        bannerClass = 'bg-red-600 text-white';
        title = 'Action needed to start your subscription';
        message = 'Finish payment authorization or update your card.';
        break;
      case 'canceled':
        bannerClass = 'bg-amber-600 text-white';
        title = 'Your subscription has ended';
        message = 'Reactivate to regain access.';
        break;
    }
  }

  const handleBillingPortal = async () => {
    if (!userInfo?.stripe_customer_id) return;
    // const { url } = await openBillingPortal({
    //   customerId: userInfo.stripe_customer_id,
    //   returnUrl: window.location.href,
    // });
    // window.location.href = url;
  };

  const store = useMainStore();

  return (
    <>
      {showBanner && (
        <div className={clsx('w-full', bannerClass)}>
          <div className="mx-auto max-w-screen-2xl px-4 py-2 flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">{title}</div>
              <div className="opacity-90">
                {message}{' '}
                {showEnd && planEndsAt ? (
                  <span className="underline underline-offset-2">
                    Ends {formatDate(planEndsAt)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              {/* Pay invoice (if present) */}
              {hasOutstanding && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const url =
                      (outstanding?.hosted_invoice_url as string) || '';
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Pay invoice
                </Button>
              )}

              {/* 🔹 Reactivate / Resubscribe */}
              {shouldShowReactivate && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reactivatePending}
                  onClick={handleReactivate}
                >
                  {reactivatePending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Reactivate
                </Button>
              )}

              <Button
                size="sm"
                variant="secondary"
                className="text-black"
                onClick={() => navigate('/dashboard/settings')}
              >
                Manage billing
              </Button>
            </div>
          </div>
        </div>
      )}

      <div
        className={clsx([
          'flex justify-between px-12 py-6 border-b-1',
          isLoggedIn && 'pl-2',
        ])}
      >
        <div className="flex gap-2 items-center">
          {isLoggedIn ? (
            <div className="flex gap-2 items-center">
              <TooltipStandalone content={<p>Toggle Sidebar</p>}>
                <SidebarTrigger className="px-4" />
              </TooltipStandalone>

              {pagesMap[pathname] ? (
                <p className="text-muted-foreground font-semibold border-l-1 pl-4 ">
                  {pagesMap[pathname]}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="font-branding text-3xl font-bold">Calliya</p>
          )}
        </div>

        <div className="flex gap-4 items-center">
          {isLoggedIn && <AudioSettingsHoverCard />}

          {isLoggedIn && (
            <TooltipStandalone content={'Notifications'}>
              <NotificationBadge label={unreadCount}>
                <Notifications>
                  <Button variant={'outline'} size={'icon'}>
                    <Bell />
                  </Button>
                </Notifications>
              </NotificationBadge>
            </TooltipStandalone>
          )}

          {/* <ModeToggle /> */}

          {isLoggedIn && (
            <TooltipStandalone content={<p>Logout</p>}>
              <Button
                variant="outline"
                size="icon"
                onClick={async () => {
                  const { setUser, setActiveCompany, setActiveNumber } =
                    useMainStore.getState();

                  setUser(null);

                  setActiveCompany(undefined as any);
                  setActiveNumber(undefined as any);

                  useMainStore.persist.clearStorage();
                  await useMainStore.persist.rehydrate();

                  await signOut(auth);
                }}
              >
                <LogOut className="h-[1.2rem] w-[1.2rem]" />
              </Button>
            </TooltipStandalone>
          )}
        </div>
      </div>
    </>
  );
}
