import { Label } from '@/components/ui/label';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';

const inboxes = [
  {
    lastMessage: 'Hi, can you send over the report?',
    number: '+15551234567',
    name: 'Alice Johnson',
  },
  {
    lastMessage: 'Thanks for the update. Talk soon!',
    number: '+15557654321',
    name: 'Ben Carter',
  },
  {
    lastMessage: 'Please confirm our meeting time.',
    number: '+15559876543',
    name: 'Clara Lee',
  },
  {
    lastMessage: 'Here’s the invoice for April.',
    number: '+15553456789',
    name: 'David Romero',
  },
  {
    lastMessage: 'Following up on our last call.',
    number: '+15552345678',
    name: 'Emma Zhang',
  },
];

function Inbox() {
  return (
    <div className="h-full">
      <Sidebar collapsible="none" className="h-full">
        <SidebarHeader>
          <Label>Inbox</Label>
          <SidebarInput placeholder="Type to search inbox..." />
          <SidebarSeparator />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="flex">
            <SidebarGroupLabel>Messages</SidebarGroupLabel>
            <SidebarMenu>
              {inboxes.map((inbox) => (
                <SidebarMenuItem key={inbox.number}>
                  <SidebarMenuButton>{inbox.name}</SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </div>
  );
}

export default Inbox;
