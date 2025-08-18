import {
  ChevronsUpDown,
  Contact2,
  History,
  Home,
  Inbox,
  MessageCirclePlus,
  PhoneIcon,
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
} from '@/components/ui/sidebar';

import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react';
import { Link, useLocation } from 'react-router';
import { NumberSwitcher } from './number-switcher';
import { useTheme } from './theme-provider';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

type SidebarNavItem = {
  title: string;
  url: string | null;
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
  >;
  onClick?: () => void;
};

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

  // Fetch companies when there is a user (not based on activeCompany)
  const { data: companies, isFetching: companiesLoading } = useQuery({
    ...trpc.companies.getUserCompanies.queryOptions(),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: !!user,
  });

  // Normalize/validate activeCompany against the fetched list
  useEffect(() => {
    if (!companiesLoading && companies) {
      const activeIsValid = activeCompany
        ? companies.some((c) => c.id === activeCompany.id)
        : false;

      if (!activeIsValid) {
        // Replace with first available or null
        const next = companies[0] ?? null;
        setActiveCompany(next);
        // Ensure numbers will be recomputed for the newly selected company
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

  // Fetch numbers for whichever company is active (after normalization)
  const { data: numbers, isFetching: numbersLoading } = useQuery({
    ...trpc.numbers.getCompanyNumbers.queryOptions({
      companyId: activeCompany?.id as string,
    }),
    enabled: !!activeCompany,
    refetchOnWindowFocus: false,
  });

  // Normalize/validate activeNumber against the fetched numbers
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

  // Use the object coming from the numbers list to avoid identity mismatches
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

  // ------------- IMPORTANT GUARD: wait for hydration -------------
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
            onClick={() => setCompanySwitcherDialogShown(true)}
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
              <Link to="/dashboard">
                <Home />
                Home
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {smsItems.length ? (
          <SidebarGroup>
            <SidebarGroupLabel>Messages</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {smsItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url}
                    >
                      {item.url ? (
                        <Link to={item.url}>
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
        ) : null}

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

        <SidebarFooter>
          <SidebarGroup>
            <SidebarGroupLabel>Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === '/dashboard/settings'}
                  >
                    <Link to={'/dashboard/settings'}>
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
    </Sidebar>
  );
}

export default BaseSidebar;
