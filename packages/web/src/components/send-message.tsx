'use client';

import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { useRef, useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { getQueryClient } from '@/App';
import { Paperclip, X } from 'lucide-react';
import { Button } from './ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { PhoneInput } from './ui/phone-input';
import { Textarea } from './ui/textarea';

// MMS-related imports
import { useAttachmentPrep } from '@/hooks/useAttachmentPrep';
import AttachmentPreview from './attachment-preview';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

// Plan feature helper
import { hasFeature, type PlanName } from '@/lib/utils';

const schema = z.object({
  recipient: z.string().min(1, 'Phone number is required'),
  message: z.string().min(1, 'Message is required'),
});

type Schema = z.infer<typeof schema>;

function SendMessageDialog() {
  const [mode, setMode] = useState<'phone' | 'contact'>('phone');
  const trpc = useTRPC();
  const { activeCompany, activeNumber, setSendMessageModalShown } =
    useMainStore();

  const { data: contacts } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions({
      companyId: activeCompany?.id as string,
    })
  );

  // Get user info for feature checks
  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());
  const canMMS = hasFeature(userInfo?.selected_plan as PlanName, 'mms');

  const { mutateAsync: sendMessage, isPending: sendingMessage } = useMutation(
    trpc.twilio.sendSMS.mutationOptions()
  );

  const { mutateAsync: createContact } = useMutation(
    trpc.contacts.createContact.mutationOptions()
  );

  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const selectedContact = contacts?.find((c) => c.id === selectedContactId);

  const shown = useMainStore((state) => state.sendMessageModalShown);
  const setShown = useMainStore((state) => state.setSendMessageModalShown);

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: {
      recipient: '',
      message: '',
    },
  });

  // Attachments setup (only used if canMMS)
  const {
    attachments,
    addAttachment,
    removeAttachment,
    getBase64Attachments,
    clearAttachments,
    totalSize,
  } = useAttachmentPrep();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onSendMessage: SubmitHandler<Schema> = async (data) => {
    try {
      let rawNumber = data.recipient;

      if (selectedContactId) {
        const selected = contacts?.find((c) => c.id === selectedContactId);
        rawNumber = selected?.number || '';
      }

      const cleaned = rawNumber.replace(/[^\d+]/g, '');
      const assumed = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;
      const parsed = parsePhoneNumberFromString(assumed);

      if (!parsed || !parsed.isValid()) {
        alert('Invalid phone number');
        return;
      }

      let contact = contacts?.find(
        (contact) => contact.number === parsed.number
      );

      if (!contact) {
        contact = await createContact({
          number: parsed.number,
          companyId: activeCompany?.id as string,
          label: parsed.number,
        });
      }

      // Only prepare attachments if MMS is allowed
      const mappedAttachments =
        canMMS && attachments.length > 0
          ? (await getBase64Attachments()).map((b64) => ({ ...b64 }))
          : undefined;

      await sendMessage({
        numberId: activeNumber?.id as string,
        contactId: contact.id,
        body: data.message,
        attachments: mappedAttachments,
      });

      const queryClient = getQueryClient();

      queryClient.invalidateQueries({
        queryKey: trpc.inboxes.getActivityByContact.infiniteQueryKey({
          contactId: contact.id,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.inboxes.getNumberInboxes.queryKey({
          numberId: activeNumber?.id as string,
        }),
      });

      toast.success('Message sent');
      clearAttachments();
      setSendMessageModalShown(false);
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  return (
    <Dialog open={shown} onOpenChange={setShown}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg sm:text-xl">
            Send new message
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Send an {canMMS ? 'SMS or MMS' : 'SMS'} to a phone number
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mb-2 flex-shrink-0">
          <Button
            type="button"
            variant={mode === 'phone' ? 'default' : 'outline'}
            onClick={() => {
              setMode('phone');
              setSelectedContactId(null);
            }}
            className="text-sm sm:text-base"
          >
            Phone Number
          </Button>
          <Button
            type="button"
            variant={mode === 'contact' ? 'default' : 'outline'}
            onClick={() => setMode('contact')}
            className="text-sm sm:text-base"
          >
            From Contacts
          </Button>
        </div>

        {selectedContactId && selectedContact && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm text-green-600 font-medium px-1 mb-2 gap-2 flex-shrink-0">
            <span className="break-words">
              {selectedContact.label} — {selectedContact.number}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedContactId(null);
                form.setValue('recipient', '');
              }}
              className="text-red-500 hover:text-red-700 whitespace-nowrap"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
        )}

        <div className="overflow-y-auto flex-1 pr-2 sm:pr-0">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSendMessage)}
              id="send-message"
              className="space-y-4 sm:space-y-6"
            >
              <FormField
                control={form.control}
                name="recipient"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm sm:text-base">
                      Recipient
                    </FormLabel>
                    <FormControl>
                      {mode === 'phone' ? (
                        <PhoneInput
                          onChange={(value) => {
                            field.onChange(value);
                            setSelectedContactId(null);
                          }}
                          value={field.value}
                          placeholder="Enter phone number"
                          disablePortal
                          className="text-sm sm:text-base"
                        />
                      ) : (
                        <Command className="border rounded-md shadow-sm">
                          <CommandInput
                            placeholder="Search contacts..."
                            className="text-sm sm:text-base"
                          />
                          <CommandList className="max-h-48 sm:max-h-64">
                            <CommandEmpty>No contacts found.</CommandEmpty>
                            {contacts?.map((contact) => (
                              <CommandItem
                                key={contact.number}
                                value={contact.number}
                                onSelect={() => {
                                  field.onChange(contact.number);
                                  setSelectedContactId(contact.id);
                                }}
                                className={clsx(
                                  'cursor-pointer text-sm sm:text-base py-2 sm:py-3',
                                  selectedContactId === contact.id &&
                                    'bg-accent text-accent-foreground'
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="font-medium truncate">
                                    {contact.label}
                                  </p>
                                  <p className="text-muted-foreground text-xs sm:text-sm truncate">
                                    {contact.number}
                                  </p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      )}
                    </FormControl>
                    <FormMessage className="text-xs sm:text-sm" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm sm:text-base">
                      Message
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        className="resize-none text-sm sm:text-base min-h-24 sm:min-h-32"
                      />
                    </FormControl>
                    <FormMessage className="text-xs sm:text-sm" />
                  </FormItem>
                )}
              />

              {/* MMS attachments — only rendered if allowed */}
              {canMMS && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <FormLabel className="mb-0 text-sm sm:text-base">
                      Attachments
                    </FormLabel>
                    {totalSize && (
                      <Badge
                        title="Total size of all attachments"
                        className="text-xs sm:text-sm"
                      >
                        {totalSize}/5 MB
                      </Badge>
                    )}
                  </div>

                  {attachments.length > 0 && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3 overflow-auto pb-2">
                        {attachments.map((file) => (
                          <div key={file.id} className="h-20 sm:h-24">
                            <AttachmentPreview
                              file={file}
                              onClose={() => removeAttachment(file.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="flex">
                    <input
                      ref={fileInputRef}
                      id="file-upload"
                      type="file"
                      accept="image/*,video/3gpp"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length) files.forEach(addAttachment);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-2 text-sm sm:text-base w-full sm:w-auto"
                    >
                      <Paperclip className="w-4 h-4" />
                      Add Attachments
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </Form>
        </div>

        <DialogFooter className="flex-shrink-0 mt-4 sm:mt-6">
          <Button
            form="send-message"
            type="submit"
            disabled={!form.formState.isValid || sendingMessage}
            className="w-full sm:w-auto text-sm sm:text-base"
          >
            {sendingMessage ? 'Sending' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendMessageDialog;
