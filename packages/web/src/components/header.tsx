import { useAuth } from '@/hooks/auth-provider';
import { auth } from '@/lib/firebase';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { signOut } from 'firebase/auth';
import { AlertTriangle, Bell, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import AudioSettingsHoverCard from './audio-settings-dialog';
import Notifications from './notifications';
import { Button } from './ui/button';
import { NotificationBadge } from './ui/notification-badge';
import { SidebarTrigger } from './ui/sidebar';
import { ModeToggle } from './ui/toggle-mode';
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

  // // Stripe Billing Portal
  // const { mutateAsync: openBillingPortal, isPending: openingPortal } =
  //   trpc.stripe.createBillingPortalSession.useMutation?.() ??
  //   // Fallback if you prefer the mutationOptions() pattern:
  //   useMutation(trpc.stripe.createBillingPortalSession.mutationOptions());

  // Stripe-like statuses you store in DB via webhooks or subscription flows
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

  const showBanner =
    isLoggedIn &&
    (subStatus === 'past_due' ||
      subStatus === 'unpaid' ||
      subStatus === 'incomplete' ||
      subStatus === 'incomplete_expired' ||
      subStatus === 'canceled');

  // Banner content
  let bannerClass = 'bg-black text-white';
  let title = '';
  let message = '';
  let showEnd = false;

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
      bannerClass = 'bg-amber-500 text-white';
      if (planEndsAt && planEndsAt.getTime() > Date.now()) {
        title = 'Your subscription will end soon';
        message = `Access ends on ${formatDate(planEndsAt)}${
          daysLeft && daysLeft > 0
            ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`
            : ''
        }. You can resume your plan anytime.`;
        showEnd = true;
      } else {
        title = 'Your subscription has ended';
        message = 'Reactivate to regain access.';
      }
      break;
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
              <Button
                size="sm"
                variant="secondary"
                className="text-black"
                onClick={handleBillingPortal}
                // disabled={openingPortal}
              >
                {planEndsAt ? 'Opening…' : 'Manage billing'}
              </Button>
              {/* Optional: “Reactivate” CTA if already ended and you want to send them to Checkout
              {subStatus === 'canceled' && (!planEndsAt || planEndsAt < new Date()) && (
                <Button size="sm" variant="outline" onClick={handleReactivate}>
                  Reactivate
                </Button>
              )} */}
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

          <ModeToggle />

          {isLoggedIn && (
            <TooltipStandalone content={<p>Logout</p>}>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  authContext.setUser(null);
                  store.setActiveCompany(null);
                  store.setActiveNumber(null);
                  store.setUser(null);
                  signOut(auth);
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
