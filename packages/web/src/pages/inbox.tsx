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
import { cn } from '@/lib/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatDistance } from 'date-fns';
import { Circle, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

function Inbox() {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const [selectedInboxContactId, setSelectedInboxContactId] = useState<
    string | null
  >(null);

  const { mutateAsync: markInboxViewed } = useMutation(
    trpc.inboxes.markAsViewed.mutationOptions()
  );

  const {
    data: inboxes,
    isLoading,
    refetch,
  } = useQuery(
    trpc.inboxes.getNumberInboxes.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );
  return (
    <div className="h-[91vh] flex">
      <Sidebar collapsible="none" className="h-full w-80">
        <SidebarHeader className="px-0">
          <Label>Messages</Label>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="flex flex-col gap-2 p-0">
            <SidebarGroupContent className="flex flex-col">
              {inboxes?.map((inbox) => {
                const isUnread =
                  inbox.lastMessage &&
                  new Date(
                    inbox?.lastMessage?.created_at as string
                  ).toISOString() >
                    new Date(inbox.lastViewedAt || 0).toISOString();

                return (
                  <div
                    key={inbox.id}
                    className={cn(
                      'flex flex-col gap-2 border-t pt-2 py-1 px-2 cursor-pointer',
                      selectedInboxContactId === inbox.contactId &&
                        'font-medium bg-accent',
                      isUnread && 'bg-muted font-semibold'
                    )}
                    onClick={async () => {
                      setSelectedInboxContactId(inbox.contactId);
                      await markInboxViewed({ inboxId: inbox.id });
                      refetch();
                    }}
                  >
                    <div className="flex justify-between w-full items-center">
                      <span className="font-medium">{inbox.contact.label}</span>
                      {isUnread && (
                        <Circle
                          fill="white"
                          className=" animate-pulse"
                          size={8}
                        />
                      )}
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
                );
              })}
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
