import { Skeleton } from '@/components/ui/skeleton';
import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Paperclip, Phone, Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import ChatBubble from './chat-bubble';
import { Button } from './ui/button';
import { Form, FormControl, FormField } from './ui/form';
import { Input } from './ui/input';

interface MessengerProps {
  contactId?: string | null;
  inboxId?: string | null;
}

function Messenger({ contactId, inboxId }: MessengerProps) {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [prevHeight, setPrevHeight] = useState<number | null>(null);
  const [readyToPaginate, setReadyToPaginate] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasReachedBottomOnce, setHasReachedBottomOnce] = useState(false);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const firstLoadRef = useRef(true);

  const { mutateAsync: markInboxViewed } = useMutation(
    trpc.inboxes.markAsViewed.mutationOptions()
  );

  const { mutateAsync: sendMessage, isPending } = useMutation(
    trpc.twilio.sendSMS.mutationOptions()
  );

  const { data: contact, isLoading: isContactLoading } = useQuery(
    trpc.contacts.findContactById.queryOptions(
      { contactId: contactId as string },
      { enabled: !!contactId }
    )
  );

  const { refetch: refetchUnreadCount } = useQuery(
    trpc.inboxes.getUnreadInboxesCount.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );

  const { refetch: refetchInboxes } = useQuery(
    trpc.inboxes.getNumberInboxes.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );

  useEffect(() => {
    setReadyToPaginate(false);
    setHasReachedBottomOnce(false);
    setInitialScrollDone(false);
    setPrevHeight(null);
  }, [contactId]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isMessagesLoading,
    refetch: refetchMessages,
  } = useInfiniteQuery(
    trpc.inboxes.getActivityByContact.infiniteQueryOptions(
      {
        contactId: contactId as string,
        limit: 20,
      },
      {
        enabled: !!contactId && !!activeNumber?.id,
        getNextPageParam: (lastPage) => lastPage?.nextCursor,
      }
    )
  );

  const form = useForm({
    resolver: zodResolver(z.object({ message: z.string().min(1).max(500) })),
  });

  useEffect(() => {
    if (!data?.pages) return;
    const ordered = data.pages
      .flatMap((page) => page.items)
      .slice()
      .reverse();
    setItems(ordered);
  }, [data]);

  useEffect(() => {
    const scrollToBottom = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      });

      if (inboxId) {
        markInboxViewed({ inboxId });
        refetchInboxes();
        refetchUnreadCount();
      }
    };

    window.addEventListener('new-message-scroll', scrollToBottom);
    return () =>
      window.removeEventListener('new-message-scroll', scrollToBottom);
  }, [inboxId]);

  useEffect(() => {
    if (
      initialScrollDone ||
      !scrollRef.current ||
      !bottomRef.current ||
      isMessagesLoading
    )
      return;

    if (isAtBottom) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'auto' });
          setInitialScrollDone(true);
          setReadyToPaginate(true);
          setHasReachedBottomOnce(true);
        });
      });
    }
  }, [items.length, isMessagesLoading, initialScrollDone, contactId]);

  function onSubmitMessage(data: { message: string }) {
    if (!contactId) return;

    const tempMessage = {
      id: `temp-${Date.now()}`,
      body: data.message,
      createdAt: new Date().toISOString(),
      direction: 'outbound',
      type: 'message',
      message: data.message,
    };

    setItems((prev) => [...prev, tempMessage]);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    sendMessage(
      {
        body: data.message,
        contactId,
        numberId: activeNumber?.id as string,
      },
      {
        onSuccess: () => {
          refetchMessages();
        },
      }
    );

    form.reset({ message: '' });
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || hasReachedBottomOnce) return;

    const checkScroll = () => {
      const isAtBottomInitially =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 10;

      console.log({ isAtBottomInitially, hasReachedBottomOnce });

      if (isAtBottomInitially) {
        setHasReachedBottomOnce(true);
      }
    };

    // Two frames to ensure layout is fully applied
    requestAnimationFrame(() => {
      requestAnimationFrame(checkScroll);
    });
  }, [contactId, items.length, hasReachedBottomOnce]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const bottomEl = bottomRef.current;
    if (!scrollEl || !bottomEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);
        if (entry.isIntersecting && !hasReachedBottomOnce) {
          setHasReachedBottomOnce(true);
        }
      },
      { root: scrollEl, threshold: 0.9 }
    );

    observer.observe(bottomEl);
    return () => observer.disconnect();
  }, [hasReachedBottomOnce]);

  useLayoutEffect(() => {
    if (!scrollRef.current || prevHeight === null) return;
    const el = scrollRef.current;
    const diff = el.scrollHeight - prevHeight;
    el.scrollTop = diff + 60;

    setPrevHeight(null);
  }, [data]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let debounce: NodeJS.Timeout | null = null;
    let delayedInitial: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      if (debounce) clearTimeout(debounce);
      console.log({
        readyToPaginate,
        hasReachedBottomOnce,
        initialScrollDone,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
      debounce = setTimeout(() => {
        if (
          readyToPaginate &&
          hasReachedBottomOnce &&
          initialScrollDone &&
          container.scrollTop < 50 &&
          (container.scrollHeight > container.clientHeight + 100 ||
            firstLoadRef.current) &&
          hasNextPage &&
          !isFetchingNextPage
        ) {
          firstLoadRef.current = false;
          setPrevHeight(container.scrollHeight);
          fetchNextPage();
        }
      }, 50);
    };

    container.addEventListener('scroll', handleScroll);

    delayedInitial = setTimeout(() => {
      handleScroll();
    }, 250);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (debounce) clearTimeout(debounce);
      if (delayedInitial) clearTimeout(delayedInitial);
    };
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    readyToPaginate,
    hasReachedBottomOnce,
    initialScrollDone,
  ]);

  const { makeCall } = useTwilioVoice();

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
    <div className="flex flex-col w-full border-l">
      <div className="border-b px-4 py-2 font-medium h-12 flex items-center w-full">
        {isContactLoading ? (
          <Skeleton className="w-full h-6" />
        ) : (
          <div className="flex justify-between w-full items-center">
            <span className="h-fit">
              {contact?.label}{' '}
              <span className="text-xs text-muted-foreground">
                ({contact?.number})
              </span>
            </span>
            <Button
              variant={'outline'}
              size={'icon'}
              onClick={() =>
                makeCall({
                  To: contact?.number as string,
                  CallerId: activeNumber?.number as string,
                })
              }
            >
              <Phone />
            </Button>
          </div>
        )}
      </div>

      {isMessagesLoading ? (
        <div className="flex-1 flex justify-center items-center">
          <span className="text-sm text-muted-foreground">
            <Loader2 className="animate-spin" />
          </span>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto scroll-smooth"
          ref={scrollRef}
          style={{ transform: 'translateZ(0)' }}
        >
          <div className="px-4 py-2 space-y-2 justify-end flex flex-col">
            {isFetchingNextPage && (
              <div className="flex justify-center w-full items-center">
                <Loader2 className="animate-spin" />
              </div>
            )}
            {(() => {
              let lastDate: string | null = null;
              return items.map((item) => {
                const dateObj = new Date(item.createdAt);
                const currentDate = dateObj.toDateString();
                const shouldShowSeparator = currentDate !== lastDate;
                lastDate = currentDate;

                return (
                  <div key={item.id}>
                    {shouldShowSeparator && (
                      <div className="flex justify-center py-2">
                        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                          {dateObj.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                    <ChatBubble item={item} />
                  </div>
                );
              });
            })()}
            {isPending && (
              <div className="flex justify-center">
                <span className="font-semibold text-xs">sending...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      <Form {...form}>
        <form
          className="flex gap-2 px-5 py-5"
          onSubmit={form.handleSubmit(onSubmitMessage)}
        >
          <Button size={'icon'} variant={'outline'}>
            <Paperclip />
          </Button>
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormControl>
                <Input className="border rounded w-full" {...field} />
              </FormControl>
            )}
          />
          <Button size={'icon'} variant={'outline'} type="submit">
            <Send />
          </Button>
        </form>
      </Form>
    </div>
  );
}

export default Messenger;
