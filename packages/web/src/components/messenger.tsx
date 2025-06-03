import { Skeleton } from '@/components/ui/skeleton';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input } from './ui/input';

interface MessengerProps {
  contactId?: string | null;
}

function Messenger({ contactId }: MessengerProps) {
  const trpc = useTRPC();

  const { activeNumber } = useMainStore();

  const { data: contact, isLoading: isContactLoading } = useQuery(
    trpc.contacts.findContactById.queryOptions(
      { contactId: contactId as string },
      { enabled: !!contactId }
    )
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isMessagesLoading,
  } = useInfiniteQuery(
    trpc.inboxes.getActivityByContact.infiniteQueryOptions(
      {
        contactId: contactId as string,
        limit: 20,
        cursor: undefined,
      },
      {
        enabled: !!contactId && !!activeNumber?.id,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }
    )
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [prevHeight, setPrevHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!scrollRef.current || prevHeight === null) return;
    const el = scrollRef.current;
    const diff = el.scrollHeight - prevHeight;
    el.scrollTop = diff;
  }, [data]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop < 50 && hasNextPage && !isFetchingNextPage) {
        setPrevHeight(container.scrollHeight);
        fetchNextPage();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  console.log({ items });

  if (!contactId) {
    return (
      <div className="flex justify-center items-center w-full h-full">
        <span className="text-md text-muted-foreground">
          Select a contact to start
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="border-b px-4 py-2 font-medium h-12 flex items-center w-full">
        {isContactLoading ? (
          <Skeleton className="w-full h-6" />
        ) : (
          <span className="w-full">
            {contact?.label} ({contact?.number})
          </span>
        )}
      </div>

      {isMessagesLoading ? (
        <div className="flex-1 flex justify-center items-center">
          <span className="text-sm text-muted-foreground">
            Loading messages...
          </span>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-y-auto px-4 py-2 space-y-2 justify-end flex flex-col h-[70vh]"
        >
          {items.map((item) => {
            const isOutbound = item.direction === 'outbound';
            const alignClass = isOutbound ? 'items-end' : 'items-start';
            const bubbleClass = isOutbound
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-900';

            return (
              <div key={item.id} className={`flex flex-col ${alignClass}`}>
                <div
                  className={`max-w-xs px-4 py-2 rounded-2xl ${bubbleClass}`}
                >
                  {item.type === 'message' ? (
                    <span>{item.message}</span>
                  ) : (
                    <span>
                      📞 Call — <strong>{item.duration}s</strong>
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  {new Date(item.createdAt).toLocaleTimeString()}
                </span>
              </div>
            );
          })}

          {isFetchingNextPage && (
            <div className="text-center text-muted-foreground text-xs py-2">
              Loading more...
            </div>
          )}
        </div>
      )}

      <div>
        <Input className="border rounded w-full" />
      </div>
    </div>
  );
}

export default Messenger;
