import { InboxItem } from '@/components/InboxItem';
import Messenger from '@/components/messenger';
import { Label } from '@/components/ui/label';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
} from '@/components/ui/sidebar';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { InboxWithDetails } from 'api/types/db';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';

function Inbox() {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const [selectedInboxContactId, setSelectedInboxContactId] = useState<
    string | null
  >(null);
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);

  const { mutateAsync: markInboxViewed } = useMutation(
    trpc.inboxes.markAsViewed.mutationOptions()
  );

  const { refetch: refetchUnreadCount } = useQuery(
    trpc.inboxes.getUnreadInboxesCount.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );

  const {
    data: inboxes,
    isLoading,
    refetch: refetchInboxes,
  } = useQuery(
    trpc.inboxes.getNumberInboxes.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );

  console.log({ inboxes });
  return (
    <div className="h-[91vh] flex">
      <Sidebar collapsible="none" className="h-full w-80">
        <SidebarHeader className="px-2 py-4 h-12 border-b">
          <Label>Messages</Label>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="flex flex-col gap-2 p-0">
            <SidebarGroupContent className="flex flex-col">
              {inboxes?.map((inbox) => (
                <InboxItem
                  isSelected={selectedInboxContactId === inbox.contactId}
                  onSelect={async () => {
                    setSelectedInboxContactId(inbox.contactId);
                    setSelectedInboxId(inbox.id);
                    await markInboxViewed({ inboxId: inbox.id });
                    await refetchInboxes();
                    await refetchUnreadCount();
                  }}
                  inbox={inbox as InboxWithDetails & { unreadCount: number }}
                  key={inbox.id}
                />
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

      <Messenger
        contactId={selectedInboxContactId}
        key={selectedInboxContactId}
        inboxId={selectedInboxId}
      />
    </div>
  );
}

export default Inbox;
