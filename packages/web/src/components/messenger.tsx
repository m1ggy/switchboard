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
}

function Messenger({ contactId }: MessengerProps) {
  const trpc = useTRPC();

  const { activeNumber } = useMainStore();

  const { mutateAsync: sendMessage, isPending } = useMutation(
    trpc.twilio.sendSMS.mutationOptions()
  );

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
    refetch: refetchMessages,
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

  const form = useForm({
    resolver: zodResolver(z.object({ message: z.string().min(1).max(500) })),
  });

  function onSubmitMessage(data: { message: string }) {
    console.log({ data });
    if (!contactId) return;

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollTop = el.scrollHeight;
  }, [items.length]);

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
          <div className="flex justify-between w-full">
            <span className="w-full">
              {contact?.label} ({contact?.number})
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
          className="flex-1 overflow-scroll scroll-smooth"
          ref={scrollRef}
          style={{ transform: 'translateZ(0)' }}
        >
          <div className="px-4 py-2 space-y-2 justify-end flex flex-col">
            {isFetchingNextPage && (
              <div className="flex justify-center w-full items-center">
                <Loader2 />
              </div>
            )}
            {items.map((item) => (
              <ChatBubble item={item} key={item.id} />
            ))}
            {isPending && (
              <div className="flex justify-center">
                <span className="font-semibold text-xs">sending...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <Form {...form}>
        <form
          className="flex gap-2 px-5"
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
