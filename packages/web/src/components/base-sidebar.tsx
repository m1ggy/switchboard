import {
  ChevronsUpDown,
  Contact2,
  History,
  Home,
  PhoneIcon,
  Settings,
  UserPlus,
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
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { NumberSwitcher } from './number-switcher';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
// const smsItems: unknown[] = [
//   // {
//   //   title: 'New Message',
//   //   url: null,
//   //   icon: MessageCirclePlus,
//   //   onClick: () => {
//   //     useMainStore.getState().setSendMessageModalShown(true);
//   //   },
//   // },
//   // {
//   //   title: 'Inbox',
//   //   url: '/dashboard/inbox',
//   //   icon: Inbox,
//   // },
//   // {
//   //   title: 'Drafts',
//   //   url: '/dashboard/drafts',
//   //   icon: MessageSquareDashed,
//   // },
//   // {
//   //   title: 'Sent',
//   //   url: '/dashboard/sent',
//   //   icon: MessageSquareShareIcon,
//   // },
// ];

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
    activeCompany,
    activeNumber,
    setActiveCompany,
    setActiveNumber,
    setCompanySwitcherDialogShown,
  } = useMainStore();

  const { data: companies, isFetching: companiesLoading } = useQuery(
    trpc.companies.getUserCompanies.queryOptions()
  );

  const { data: numbers, isFetching: numbersLoading } = useQuery({
    ...trpc.numbers.getCompanyNumbers.queryOptions({
      companyId: activeCompany?.id as string,
    }),
    enabled: !!activeCompany,
  });

  useEffect(() => {
    if (companies?.length) {
      setActiveCompany(companies?.[0]);
    }
  }, [companies, setActiveCompany]);

  useEffect(() => {
    if (numbers?.length) {
      setActiveNumber(numbers?.[0]);
    }
  }, [setActiveNumber, numbers]);
  return (
    <Sidebar>
      <SidebarContent className="overflow-x-hidden p-2">
        <SidebarHeader className="font-branding font-bold text-2xl">
          Switchboard
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
              {activeCompany?.name}
            </p>
            <ChevronsUpDown size={18} />
          </div>
        )}
        <NumberSwitcher
          numbers={numbers ?? []}
          isLoading={numbersLoading}
          defaultValue={activeNumber}
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

        {/* {smsItems.length ? (
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
        ) : null} */}
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
                  <SidebarMenuButton>
                    <Settings />
                    Settings
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
