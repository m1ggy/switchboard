import clsx from 'clsx';
import { Bell, LogOut } from 'lucide-react';
import { useLocation } from 'react-router';
import Notifications from './notifications';
import { Button } from './ui/button';
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
  const location = useLocation();

  const pathname = location.pathname;
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
              <SidebarTrigger className="border-r-1 px-4" />
            </TooltipStandalone>

            {pagesMap[pathname] ? (
              <p className="text-muted-foreground font-semibold">
                {pagesMap[pathname]}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="font-branding text-3xl font-bold">Switchboard</p>
        )}
      </div>
      <div className="flex gap-4 items-center">
        {isLoggedIn && (
          <TooltipStandalone content={'Notifications'}>
            <Notifications>
              <Button variant={'outline'} size={'icon'}>
                <Bell />
              </Button>
            </Notifications>
          </TooltipStandalone>
        )}
        <ModeToggle />
        {isLoggedIn && (
          <TooltipStandalone content={<p>Logout</p>}>
            <Button variant="outline" size="icon">
              <LogOut className="h-[1.2rem] w-[1.2rem]" />
            </Button>
          </TooltipStandalone>
        )}
      </div>
    </div>
  );
}

export default Header;
