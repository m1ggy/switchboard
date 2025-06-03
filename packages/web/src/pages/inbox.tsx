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
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

function Inbox() {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();

  const { data: inboxes, isLoading } = useQuery(
    trpc.inboxes.getNumberInboxes.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );
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
              {inboxes?.map((inbox) => (
                <SidebarMenuItem key={inbox.id}>
                  <SidebarMenuButton>{inbox.contact.label}</SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          {isLoading && (
            <div className="flex justify-center">
              <LoaderCircle className="animate-spin" />
            </div>
          )}

          {!inboxes?.length ? (
            <span className="text-muted-foreground text-xs text-center">
              No messages
            </span>
          ) : null}
        </SidebarContent>
      </Sidebar>
    </div>
  );
}

export default Inbox;
