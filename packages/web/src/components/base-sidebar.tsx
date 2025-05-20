import {
  Contact2,
  History,
  Home,
  Inbox,
  MessageCirclePlus,
  MessageSquareDashed,
  MessageSquareShareIcon,
  PhoneIcon,
  UserPlus,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
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
import { faker } from '@faker-js/faker';
import { Link, useLocation } from 'react-router';
import { NumberSwitcher } from './number-switcher';
import { Button } from './ui/button';
const smsItems = [
  {
    title: 'New Message',
    url: null,
    icon: MessageCirclePlus,
    onClick: () => {
      useMainStore.getState().setSendMessageModalShown(true);
    },
  },
  {
    title: 'Inbox',
    url: '/dashboard/inbox',
    icon: Inbox,
  },
  {
    title: 'Drafts',
    url: '/dashboard/drafts',
    icon: MessageSquareDashed,
  },
  {
    title: 'Sent',
    url: '/dashboard/sent',
    icon: MessageSquareShareIcon,
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

const companies = [
  {
    number: faker.phone.number({ style: 'international' }),
    label: faker.company.name(),
  },
  {
    number: faker.phone.number({ style: 'international' }),
    label: faker.company.name(),
  },
  {
    number: faker.phone.number({ style: 'international' }),
    label: faker.company.name(),
  },
  {
    number: faker.phone.number({ style: 'international' }),
    label: faker.company.name(),
  },
  {
    number: faker.phone.number({ style: 'international' }),
    label: faker.company.name(),
  },
];

function BaseSidebar() {
  const location = useLocation();
  return (
    <Sidebar>
      <SidebarContent className="overflow-x-hidden p-2">
        <SidebarHeader className="font-branding font-bold text-2xl">
          Switchboard
        </SidebarHeader>
        <SidebarSeparator />
        <NumberSwitcher numbers={companies} />
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
      </SidebarContent>
    </Sidebar>
  );
}

export default BaseSidebar;
