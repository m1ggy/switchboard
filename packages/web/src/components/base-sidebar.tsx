import {
  ChevronsUpDown,
  Contact2,
  Download,
  History,
  Home,
  Inbox,
  MessageCirclePlus,
  PhoneIcon,
  Printer,
  Settings,
  UserPlus,
  type LucideProps,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';

import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useState,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react';
import { Link, useLocation } from 'react-router';
import { NumberSwitcher } from './number-switcher';
import { useTheme } from './theme-provider';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import FaxSendDialog from './ui/fax-send-dialog';
import { Skeleton } from './ui/skeleton';

// plan feature helper
import { useIsMobile } from '@/hooks/use-mobile';
import { hasFeature, type PlanName } from '@/lib/utils';

// ---- Types ----
type SidebarNavItem = {
  title: string;
  url: string | null;
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
  >;
  onClick?: () => void;
};

// PWA: beforeinstallprompt event
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

function isStandaloneDisplay(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}
function isIOSStandalone(): boolean {
  // @ts-expect-error - iOS Safari
  return !!window.navigator?.standalone;
}
function isInstalled(): boolean {
  return isStandaloneDisplay() || isIOSStandalone();
}

const smsItems: SidebarNavItem[] = [
  {
    title: 'Send Message',
    onClick: () => useMainStore.getState().setSendMessageModalShown(true),
    icon: MessageCirclePlus,
    url: null,
  },
  {
    title: 'Inbox',
    url: '/dashboard/inbox',
    icon: Inbox,
  },
];

const callsItems = [
  {
    title: 'New Call',
    url: null,
    icon: PhoneIcon,
    onClick: () => useMainStore.getState().setDialerModalShown(true),
  },
  {
    title: 'Call History',
    url: '/dashboard/call-history',
    icon: History,
  },
];

const contactsItems = [
  {
    title: 'Add Contact',
    url: null,
    icon: UserPlus,
    onClick: () => useMainStore.getState().setCreateContactModalShown(true),
  },
  {
    title: 'All Contacts',
    url: '/dashboard/all-contacts',
    icon: Contact2,
  },
];

function BaseSidebar() {
  const location = useLocation();
  const trpc = useTRPC();
  const {
    _rehydrated,
    user,
    activeCompany,
    activeNumber,
    setActiveCompany,
    setActiveNumber,
    setCompanySwitcherDialogShown,
  } = useMainStore();

  const [showFaxDialog, setShowFaxDialog] = useState(false);

  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());
  const canFax = hasFeature(userInfo?.selected_plan as PlanName, 'fax');

  const { data: companies, isFetching: companiesLoading } = useQuery({
    ...trpc.companies.getUserCompanies.queryOptions(),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: !!user,
  });

  useEffect(() => {
    if (!companiesLoading && companies) {
      const activeIsValid = activeCompany
        ? companies.some((c) => c.id === activeCompany.id)
        : false;

      if (!activeIsValid) {
        const next = companies[0] ?? null;
        setActiveCompany(next);
        setActiveNumber(null);
      }
    }
  }, [
    companies,
    companiesLoading,
    activeCompany,
    setActiveCompany,
    setActiveNumber,
  ]);

  const { data: numbers, isFetching: numbersLoading } = useQuery({
    ...trpc.numbers.getCompanyNumbers.queryOptions({
      companyId: activeCompany?.id as string,
    }),
    enabled: !!activeCompany,
    refetchOnWindowFocus: false,
  });

  const { setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();

  const closeIfMobile = () => {
    if (isMobile) setOpenMobile?.(false);
  };

  useEffect(() => {
    if (!numbersLoading && numbers) {
      const activeIsValid = activeNumber
        ? numbers.some((n) => n.id === activeNumber.id)
        : false;

      if (!activeIsValid) {
        setActiveNumber(numbers[0] ?? null);
      }
    }
  }, [numbers, numbersLoading, activeNumber, setActiveNumber]);

  const activeNumberFromList =
    numbers?.find((n) => n.id === activeNumber?.id) ?? null;

  const { data: inboxUnreadCount } = useQuery(
    trpc.inboxes.getUnreadInboxesCount.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );

  const unreadCount = inboxUnreadCount?.length
    ? inboxUnreadCount.reduce((prev, curr) => prev + curr.unreadCount, 0)
    : null;

  const theme = useTheme();

  // ---- PWA install state shared with bridge ----
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isInstalled());

  useEffect(() => {
    // Load any cached prompt immediately
    if (window.__deferredPrompt && !isInstalled()) {
      setDeferredPrompt(window.__deferredPrompt);
    }

    const onAvailable = (
      e: CustomEvent<{ deferredPrompt: BeforeInstallPromptEvent }>
    ) => {
      setDeferredPrompt(e.detail.deferredPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener(
      'pwa-install-available',
      onAvailable as EventListener
    );
    window.addEventListener('appinstalled', onInstalled);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onModeChange = () => setInstalled(isInstalled());
    mq?.addEventListener?.('change', onModeChange);

    return () => {
      window.removeEventListener(
        'pwa-install-available',
        onAvailable as EventListener
      );
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onModeChange);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    closeIfMobile();
  };
  useEffect(() => {
    if (!isInstalled() && window.__deferredPrompt) {
      setDeferredPrompt(window.__deferredPrompt);
    }
    const onAvailable = (
      e: CustomEvent<{ deferredPrompt: BeforeInstallPromptEvent }>
    ) => setDeferredPrompt(e.detail.deferredPrompt);
    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
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

  if (!_rehydrated) {
    return (
      <Sidebar>
        <SidebarContent className="overflow-x-hidden p-2">
          <SidebarHeader className="my-2 px-2">
            <Skeleton className="w-[160px] h-[28px]" />
          </SidebarHeader>
          <SidebarSeparator />
          <Skeleton className="w-[200px] h-[20px] rounded-full" />
          <div className="mt-2 space-y-2">
            <Skeleton className="w-full h-[36px]" />
            <Skeleton className="w-full h-[36px]" />
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarContent className="overflow-x-hidden p-2">
        <SidebarHeader className="my-2 px-2">
          <div className="flex justify-center">
            <img
              src={`/calliya-${theme.theme}.png`}
              alt="Calliya"
              className="w-[160px] h-auto object-contain"
            />
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        {companiesLoading ? (
          <Skeleton className="w-[200px] h-[20px] rounded-full" />
        ) : (
          <div
            className="flex hover:bg-accent rounded pl-3 pr-2 justify-between items-center cursor-pointer"
            title="Change company"
            onClick={() => {
              setCompanySwitcherDialogShown(true);
              closeIfMobile();
            }}
          >
            <p className="text-muted-foreground font-semibold">
              {activeCompany?.name ?? 'No company'}
            </p>
            <ChevronsUpDown size={18} />
          </div>
        )}

        <NumberSwitcher
          numbers={numbers ?? []}
          isLoading={numbersLoading}
          defaultValue={activeNumberFromList}
        />

        <SidebarSeparator />

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location.pathname === '/dashboard'}
            >
              <Link to="/dashboard" onClick={closeIfMobile}>
                <Home />
                Home
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Messages */}
        {smsItems.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              isActive={location.pathname === item.url}
            >
              {item.url ? (
                <Link to={item.url!} onClick={closeIfMobile}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </div>
                    {item.title === 'Inbox' &&
                      unreadCount &&
                      unreadCount > 0 && (
                        <Badge variant="secondary" className="ml-auto">
                          {unreadCount}
                        </Badge>
                      )}
                  </div>
                </Link>
              ) : item.onClick ? (
                <Button
                  onClick={() => {
                    item.onClick?.();
                    closeIfMobile();
                  }}
                  className="cursor-pointer"
                  variant="outline"
                >
                  <item.icon />
                  <span>{item.title}</span>
                </Button>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}

        {/* Calls */}
        <SidebarGroup>
          <SidebarGroupLabel>Calls</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {callsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                  >
                    {item.url ? (
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    ) : item.onClick ? (
                      <Button
                        onClick={() => {
                          item.onClick?.();
                          closeIfMobile();
                        }}
                        className="cursor-pointer"
                        variant="outline"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Button>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Contacts */}
        <SidebarGroup>
          <SidebarGroupLabel>Contacts</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {contactsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                  >
                    {item.url ? (
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    ) : item.onClick ? (
                      <Button
                        onClick={item.onClick}
                        className=" cursor-pointer"
                        variant={'outline'}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Button>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Fax */}
        {canFax && (
          <SidebarGroup>
            <SidebarGroupLabel>Fax</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Button
                      onClick={() => {
                        setShowFaxDialog(true);
                        closeIfMobile();
                      }}
                      className="cursor-pointer"
                      variant="outline"
                    >
                      <Printer />
                      <span>Send Fax</span>
                    </Button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarFooter>
          <SidebarGroup>
            <SidebarGroupLabel>Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Install App: only when not installed AND a prompt exists */}
                {!installed && deferredPrompt && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Button
                        onClick={handleInstallClick}
                        className="cursor-pointer"
                        variant="outline"
                      >
                        <Download />
                        <span>Install App</span>
                      </Button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === '/dashboard/settings'}
                  >
                    <Link to="/dashboard/settings" onClick={closeIfMobile}>
                      <Settings />
                      Settings
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarFooter>
      </SidebarContent>

      <FaxSendDialog
        open={showFaxDialog}
        onOpenChange={setShowFaxDialog}
        contactId={undefined}
        defaultFromName={activeCompany?.name ?? ''}
      />
    </Sidebar>
  );
}

export default BaseSidebar;
