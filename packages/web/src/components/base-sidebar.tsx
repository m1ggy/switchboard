import {
  BotMessageSquare,
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
  Video,
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
  useMemo,
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
import VideoCallDialog from './ui/video-call-dialog';

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
  restricted?: boolean;
  feature?: Parameters<typeof hasFeature>[1];
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

const callsItems: SidebarNavItem[] = [
  {
    title: 'New Call',
    url: null,
    icon: PhoneIcon,
    onClick: () => useMainStore.getState().setDialerModalShown(true),
  },
  {
    title: 'Video Call',
    url: null,
    icon: Video,
  },
  {
    title: 'Call History',
    url: '/dashboard/call-history',
    icon: History,
  },
  {
    title: 'Automated Calls',
    url: '/dashboard/automated-calls',
    icon: BotMessageSquare,
    restricted: true,
  },
];

const contactsItems: SidebarNavItem[] = [
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
  const [showVideoCallDialog, setShowVideoCallDialog] = useState(false);

  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());
  const selectedPlan = userInfo?.selected_plan as PlanName | undefined;

  const canFax = hasFeature(selectedPlan as PlanName, 'fax');
  const canVideoCall = hasFeature(selectedPlan as PlanName, 'video_calls');

  const filterRestrictedItems = (items: SidebarNavItem[]) =>
    items.filter((item) => {
      if (item.title === 'Video Call') return canVideoCall;
      if (!item.restricted) return true;
      if (!item.feature || !selectedPlan) return false;
      return hasFeature(selectedPlan, item.feature);
    });

  const visibleSmsItems = useMemo(
    () => filterRestrictedItems(smsItems),
    [selectedPlan]
  );

  const visibleCallsItems = useMemo(
    () => filterRestrictedItems(callsItems),
    [selectedPlan, canVideoCall]
  );

  const visibleContactsItems = useMemo(
    () => filterRestrictedItems(contactsItems),
    [selectedPlan]
  );

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
            <Skeleton className="h-[28px] w-[160px]" />
          </SidebarHeader>
          <SidebarSeparator />
          <Skeleton className="h-[20px] w-[200px] rounded-full" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-[36px] w-full" />
            <Skeleton className="h-[36px] w-full" />
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
              className="h-auto w-[160px] object-contain"
            />
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        {companiesLoading ? (
          <Skeleton className="h-[20px] w-[200px] rounded-full" />
        ) : (
          <div
            className="flex cursor-pointer items-center justify-between rounded pl-3 pr-2 hover:bg-accent"
            title="Change company"
            onClick={() => {
              setCompanySwitcherDialogShown(true);
              closeIfMobile();
            }}
          >
            <p className="font-semibold text-muted-foreground">
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
        {visibleSmsItems.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              isActive={location.pathname === item.url}
            >
              {item.url ? (
                <Link to={item.url} onClick={closeIfMobile}>
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
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
        {visibleCallsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Calls</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleCallsItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url}
                    >
                      {item.url ? (
                        <Link to={item.url} onClick={closeIfMobile}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      ) : item.title === 'Video Call' ? (
                        <Button
                          onClick={() => {
                            setShowVideoCallDialog(true);
                            closeIfMobile();
                          }}
                          className="cursor-pointer"
                          variant="outline"
                        >
                          <Video />
                          <span>Video Call</span>
                        </Button>
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
        )}

        {/* Contacts */}
        {visibleContactsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Contacts</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleContactsItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url}
                    >
                      {item.url ? (
                        <Link to={item.url} onClick={closeIfMobile}>
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
        )}

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

      <VideoCallDialog
        open={showVideoCallDialog}
        onOpenChange={setShowVideoCallDialog}
      />
    </Sidebar>
  );
}

export default BaseSidebar;
