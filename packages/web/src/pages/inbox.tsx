import { InboxItem } from '@/components/InboxItem';
import Messenger from '@/components/messenger';
import { Input } from '@/components/ui/input';
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
import { LoaderCircle, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

// Small hook to detect mobile width (mirrors Tailwind md breakpoint: 768px)
function useIsMobile(breakpoint = 768) {
  const getMatches = () =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches
      : false;

  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

// Tiny debounce hook (no deps needed)
function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function Inbox() {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const [selectedInboxContactId, setSelectedInboxContactId] = useState<
    string | null
  >(null);
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);

  const isMobile = useIsMobile();

  // Search state
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const trimmedSearch = debouncedSearch.trim();
  const isSearching = trimmedSearch.length > 0;

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
      // Pass search to server — make sure your procedure accepts it
      search: trimmedSearch || undefined,
    })
  );

  // Clear selection if active number changes
  useEffect(() => {
    setSelectedInboxContactId(null);
    setSelectedInboxId(null);
    setSearch('');
  }, [activeNumber?.id]);

  // On mobile, selecting an inbox switches to the Messenger view
  const handleSelect = async (
    inbox: InboxWithDetails & { unreadCount: number }
  ) => {
    setSelectedInboxContactId(inbox.contactId);
    setSelectedInboxId(inbox.id);
    await markInboxViewed({ inboxId: inbox.id });
    await refetchInboxes();
    await refetchUnreadCount();
  };

  const showOnlyList = isMobile && !selectedInboxId;
  const showOnlyMessenger = isMobile && !!selectedInboxId;

  const headerRight = useMemo(
    () => (
      <div className="relative w-full">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, number, or last message…"
          className="pl-8 pr-8 h-8"
          aria-label="Search inboxes"
          autoComplete="off"
          spellCheck={false}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
    ),
    [search]
  );

  return (
    <div className="h-[91vh] flex">
      {/* LIST (Sidebar) */}
      {(!isMobile || showOnlyList) && (
        <Sidebar
          collapsible="none"
          className={isMobile ? 'h-full w-full' : 'h-full w-80'}
        >
          <SidebarHeader className="px-4 py-4 border-b">
            <div className="flex flex-col gap-2">
              <Label>Messages</Label>
              {headerRight}
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup className="flex flex-col gap-2 p-0">
              <SidebarGroupContent className="flex flex-col">
                {inboxes?.map((inbox) => (
                  <InboxItem
                    isSelected={selectedInboxContactId === inbox.contactId}
                    onSelect={() =>
                      handleSelect(
                        inbox as InboxWithDetails & { unreadCount: number }
                      )
                    }
                    inbox={inbox as InboxWithDetails & { unreadCount: number }}
                    key={inbox.id}
                  />
                ))}
              </SidebarGroupContent>
            </SidebarGroup>

            {isLoading && (
              <div className="flex justify-center py-3">
                <LoaderCircle className="animate-spin" />
              </div>
            )}

            {!isLoading && (!inboxes || inboxes.length === 0) ? (
              <span className="text-muted-foreground text-xs text-center py-3">
                {isSearching
                  ? `No results for “${trimmedSearch}”.`
                  : 'No messages'}
              </span>
            ) : null}
          </SidebarContent>
        </Sidebar>
      )}

      {/* MESSENGER */}
      {(!isMobile || showOnlyMessenger) && (
        <div
          className={
            isMobile ? 'flex-1 h-full w-full flex flex-col' : 'flex-1 h-full'
          }
        >
          <Messenger
            contactId={selectedInboxContactId}
            inboxId={selectedInboxId}
            onBack={() => {
              setSelectedInboxContactId(null);
              setSelectedInboxId(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default Inbox;
