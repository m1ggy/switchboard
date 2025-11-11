import { Skeleton } from '@/components/ui/skeleton';
import { useJitsi } from '@/hooks/jitsi-provider';
import { useTwilioVoice } from '@/hooks/twilio-provider';
import { useLightbox } from '@/hooks/use-lightbox';
import { useAttachmentPrep } from '@/hooks/useAttachmentPrep';
import useMainStore from '@/lib/store';
import { useVideoCallStore } from '@/lib/stores/videocall';
import { useTRPC } from '@/lib/trpc';
import { hasFeature, type PlanName } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  Phone,
  Printer,
  Send,
  Video,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import AttachmentPreview from './attachment-preview';
import ChatBubble from './chat-bubble';
import { PdfPreviewModal } from './pdf-preview-modal';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import FaxSendDialog from './ui/fax-send-dialog';
import { Form, FormControl, FormField } from './ui/form';
import { Label } from './ui/label';
import Lightbox from './ui/lightbox';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import TooltipStandalone from './ui/tooltip-standalone';

interface MessengerProps {
  contactId?: string | null;
  inboxId?: string | null;
  /** Optional: parent can clear selection */
  onBack?: () => void;
}

function Messenger({ contactId, inboxId, onBack }: MessengerProps) {
  const trpc = useTRPC();
  const { activeNumber, setActiveVideoCallDialogShown } = useMainStore();
  const { setCurrentCallContactId } = useVideoCallStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [prevHeight, setPrevHeight] = useState<number | null>(null);
  const [readyToPaginate, setReadyToPaginate] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasReachedBottomOnce, setHasReachedBottomOnce] = useState(false);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const firstLoadRef = useRef(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showFaxDialog, setShowFaxDialog] = useState(false);

  const { data: enabledFeatures } = useQuery(
    trpc.subscription.getPlanFeatures.queryOptions()
  );

  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());
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
        numberId: activeNumber?.id as string,
      },
      {
        enabled: !!contactId && !!activeNumber?.id,
        getNextPageParam: (lastPage) => lastPage?.nextCursor,
      }
    )
  );

  useEffect(() => {
    setReadyToPaginate(false);
    setHasReachedBottomOnce(false);
    setInitialScrollDone(false);
    setPrevHeight(null);
  }, [contactId]);

  useEffect(() => {
    if (contactId && inboxId) {
      refetchMessages();
    }
  }, [contactId, inboxId, refetchMessages]);

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
  }, [inboxId, markInboxViewed, refetchInboxes, refetchUnreadCount]);

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
  }, [
    items.length,
    isMessagesLoading,
    initialScrollDone,
    contactId,
    isAtBottom,
  ]);

  // ---- Autosizing textarea helpers (compact) ----
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  function autosizeTextarea(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = '0px';
    const line = 20; // ~leading-5 (20px)
    const max = line * 5; // cap at ~5 lines
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
  }

  async function onSubmitMessage(data: { message: string }) {
    if (!contactId) return;

    const base64s = await getBase64Attachments();
    const mappedAttachments = attachments.map((_, index) => ({
      ...base64s[index],
    }));

    const tempMessage = {
      id: `temp-${Date.now()}`,
      body: data.message,
      createdAt: new Date().toISOString(),
      direction: 'outbound',
      type: 'message',
      message: data.message,
      attachments: mappedAttachments,
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
        attachments: mappedAttachments.length ? mappedAttachments : undefined,
      },
      { onSuccess: () => refetchMessages() }
    );

    form.reset({ message: '' });
    clearAttachments();
    requestAnimationFrame(() => autosizeTextarea(textareaRef.current));
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || hasReachedBottomOnce) return;
    const checkScroll = () => {
      const isAtBottomInitially =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
      if (isAtBottomInitially) setHasReachedBottomOnce(true);
    };
    requestAnimationFrame(() => requestAnimationFrame(checkScroll));
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
  }, [data, prevHeight]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let debounce: NodeJS.Timeout | null = null;
    let delayedInitial: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      if (debounce) clearTimeout(debounce);
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
    delayedInitial = setTimeout(() => handleScroll(), 250);

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
  const { createRoom } = useJitsi();
  const {
    attachments,
    addAttachment,
    removeAttachment,
    getBase64Attachments,
    totalSize,
    clearAttachments,
  } = useAttachmentPrep();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { open, setOpen, files, setFiles, setIndex, index } = useLightbox();

  const handleBack = () => {
    if (onBack) return onBack();
    try {
      window.dispatchEvent(new CustomEvent('messenger-back'));
    } catch {
      // noop
    }
  };

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
    <div
      className="
    grid grid-rows-[auto,1fr,auto] w-full md:h-full
    min-h-[100dvh] md:min-h-0
    bg-background md:border-l
  "
    >
      {/* HEADER */}
      <div className="border-b px-2 md:px-4 py-2 font-medium h-12 flex items-center w-full">
        {isContactLoading ? (
          <Skeleton className="w-full h-6" />
        ) : (
          <div className="flex justify-between w-full items-center">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleBack}
                className="md:hidden"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <span className="h-fit">
                {contact?.label}{' '}
                <span className="text-xs text-muted-foreground">
                  ({contact?.number})
                </span>
              </span>
            </div>

            <div className="flex gap-2">
              {hasFeature(userInfo?.selected_plan as PlanName, 'fax') && (
                <TooltipStandalone content="Send Fax">
                  <Button
                    size="icon"
                    variant="outline"
                    type="button"
                    onClick={() => setShowFaxDialog(true)}
                    className="h-9 w-9"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </TooltipStandalone>
              )}
              {hasFeature(
                userInfo?.selected_plan as PlanName,
                'video_calls'
              ) && (
                <TooltipStandalone content="Initiate Video Call">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={async () => {
                      setCurrentCallContactId(contact?.id as string);
                      await createRoom(contactId);
                      setActiveVideoCallDialogShown(true);
                    }}
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                </TooltipStandalone>
              )}
              <TooltipStandalone content="Initiate Voice Call">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() =>
                    makeCall({
                      To: contact?.number as string,
                      CallerId: activeNumber?.number as string,
                    })
                  }
                >
                  <Phone className="h-4 w-4" />
                </Button>
              </TooltipStandalone>
            </div>
          </div>
        )}
      </div>

      {/* MESSAGES */}
      <div
        className="min-h-0 overflow-y-auto scroll-smooth"
        ref={scrollRef}
        style={{ transform: 'translateZ(0)' }}
      >
        {isMessagesLoading ? (
          <div className="h-full w-full flex items-center justify-center py-10">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
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
                    <ChatBubble
                      item={item}
                      setFiles={setFiles}
                      setIndex={setIndex}
                      setOpen={setOpen}
                      onPreviewFax={(url) => setPdfUrl(url)}
                    />
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
        )}
      </div>

      {/* ATTACHMENTS */}
      {attachments.length > 0 && (
        <div className="px-4 pt-4 pb-3 flex flex-col gap-3 border-t max-h-44 overflow-y-auto">
          <Separator />
          <Label>
            Attachments{' '}
            {totalSize && (
              <TooltipStandalone content="Total size of all attachments">
                {' '}
                <Badge>{`${totalSize}/5 MB`}</Badge>
              </TooltipStandalone>
            )}
          </Label>
          <div className="grid grid-cols-6 gap-3 overflow-auto pb-1">
            {attachments.map((file) => (
              <div key={file.id} className="h-20">
                <AttachmentPreview
                  file={file}
                  onClose={() => removeAttachment(file.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPOSER (sticky + compact) */}
      <div
        className="
          sticky bottom-0 z-10
          flex gap-2 px-3 py-2 items-center border-t bg-background
          md:pb-2 pb-[env(safe-area-inset-bottom)]
        "
      >
        {hasFeature(userInfo?.selected_plan as PlanName, 'mms') && (
          <TooltipStandalone content="Add Attachment">
            <Button
              size="icon"
              variant="outline"
              type="button"
              className="h-9 w-9"
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </TooltipStandalone>
        )}

        <input
          ref={inputRef}
          id="file-upload"
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) files.forEach(addAttachment);
            e.target.value = '';
          }}
        />

        <Form {...form}>
          <form
            className="flex gap-2 items-center w-full"
            onSubmit={form.handleSubmit(onSubmitMessage)}
          >
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormControl>
                  <Textarea
                    ref={textareaRef}
                    className="border rounded w-full resize-none max-h-40 overflow-y-auto ring-accent text-sm leading-5 px-3 py-2"
                    rows={1}
                    {...field}
                    onInput={(e) => autosizeTextarea(e.currentTarget)}
                    onFocus={(e) => autosizeTextarea(e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        form.handleSubmit(onSubmitMessage)();
                      }
                    }}
                    style={{ height: 'auto' }}
                  />
                </FormControl>
              )}
            />

            <Button
              size="icon"
              variant="outline"
              type="submit"
              aria-label="Send message"
              className="h-9 w-9"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Form>
      </div>

      {/* PORTALS / MODALS */}
      <Lightbox
        images={files}
        initialIndex={index}
        open={open}
        onOpenChange={setOpen}
      />
      <FaxSendDialog
        open={showFaxDialog}
        onOpenChange={setShowFaxDialog}
        defaultTo={contact?.number}
        contactId={contactId}
        defaultFromName={contact?.label}
      />
      <PdfPreviewModal url={pdfUrl} onClose={() => setPdfUrl(null)} />
    </div>
  );
}

export default Messenger;
