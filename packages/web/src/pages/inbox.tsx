import Messenger from '@/components/messenger';
import { Label } from '@/components/ui/label';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { formatDistance } from 'date-fns';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';

function Inbox() {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const [selectedInboxContactId, setSelectedInboxContactId] = useState<
    string | null
  >(null);

  const { data: inboxes, isLoading } = useQuery(
    trpc.inboxes.getNumberInboxes.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );
  return (
    <div className="h-full flex">
      <Sidebar collapsible="none" className="h-full w-64">
        <SidebarHeader>
          <Label>Inbox</Label>
          <SidebarInput placeholder="Type to search inbox..." />
          <SidebarSeparator />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="flex flex-col gap-2">
            <SidebarGroupLabel>Messages</SidebarGroupLabel>
            <SidebarGroupContent className="flex flex-col gap-4">
              {inboxes?.map((inbox) => (
                <div
                  key={inbox.id}
                  className="flex flex-col gap-2 border-t pt-2"
                  onClick={() => setSelectedInboxContactId(inbox.contactId)}
                >
                  <div className="flex space-between w-full">
                    <span className="font-medium">{inbox.contact.label}</span>
                  </div>
                  {inbox.lastCall && !inbox.lastMessage ? (
                    <span>call</span>
                  ) : null}
                  {inbox.lastMessage && !inbox.lastCall ? (
                    <span className="text-sm text-muted-foreground truncate overflow-hidden whitespace-nowrap max-w-48">
                      {inbox.lastMessage.message}
                    </span>
                  ) : null}
                  {inbox.lastMessage && (
                    <span className="text-xs text-muted-foreground text-right">
                      {formatDistance(
                        new Date(inbox.lastMessage?.created_at as string),
                        new Date(),
                        { addSuffix: true }
                      )}
                    </span>
                  )}
                </div>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
          {isLoading && (
            <div className="flex justify-center">
              <LoaderCircle className="animate-spin" />
            </div>
          )}

          {!inboxes?.length && !isLoading ? (
            <span className="text-muted-foreground text-xs text-center">
              No messages
            </span>
          ) : null}
        </SidebarContent>
      </Sidebar>

      <Messenger contactId={selectedInboxContactId} />
    </div>
  );
}

export default Inbox;
