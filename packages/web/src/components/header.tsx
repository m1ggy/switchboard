import { useAuth } from '@/hooks/auth-provider';
import { auth } from '@/lib/firebase';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { signOut } from 'firebase/auth';
import { Bell, LogOut } from 'lucide-react';
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

const pagesMap = {
  '/dashboard/inbox': 'Inbox',
  '/dashboard/drafts': 'Drafts',
  '/dashboard/sent': 'Sent Messages',
  '/dashboard/call-history': 'Call History',
  '/dashboard/add-contact': 'Add Contact',
  '/dashboard/all-contacts': 'All Contacts',
  '/dashboard': 'Dashboard',
} as Record<string, string>;
function Header({ isLoggedIn }: HeaderProps) {
  const trpc = useTRPC();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const authContext = useAuth();
  const { data: unreadCount } = useQuery(
    trpc.notifications.getUnreadNotificationsCount.queryOptions()
  );
  return (
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
                signOut(auth).then(() => {
                  authContext.setUser(null);
                  navigate('/sign-in');
                });
              }}
            >
              <LogOut className="h-[1.2rem] w-[1.2rem]" />
            </Button>
          </TooltipStandalone>
        )}
      </div>
    </div>
  );
}

export default Header;
