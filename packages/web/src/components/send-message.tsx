import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import parsePhoneNumberFromString from 'libphonenumber-js';
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { getQueryClient } from '@/App';
import { X } from 'lucide-react';
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

      await sendMessage({
        numberId: activeNumber?.id as string,
        contactId: contact.id,
        body: data.message,
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
      setSendMessageModalShown(false);
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  return (
    <Dialog open={shown} onOpenChange={setShown}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send new message</DialogTitle>
          <DialogDescription>Send an SMS to a phone number</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            variant={mode === 'phone' ? 'default' : 'outline'}
            onClick={() => {
              setMode('phone');
              setSelectedContactId(null);
            }}
          >
            Phone Number
          </Button>
          <Button
            type="button"
            variant={mode === 'contact' ? 'default' : 'outline'}
            onClick={() => setMode('contact')}
          >
            From Contacts
          </Button>
        </div>

        {selectedContactId && selectedContact && (
          <div className="flex items-center justify-between text-sm text-green-600 font-medium px-1 mb-2">
            <span>
              {selectedContact.label} — {selectedContact.number}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedContactId(null);
                form.setValue('recipient', '');
              }}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSendMessage)}
            id="send-message"
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="recipient"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient</FormLabel>
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
                      />
                    ) : (
                      <Command className="border rounded-md shadow-sm">
                        <CommandInput placeholder="Search contacts..." />
                        <CommandList>
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
                                'cursor-pointer',
                                selectedContactId === contact.id &&
                                  'bg-accent text-accent-foreground'
                              )}
                            >
                              <div>
                                <p className="font-medium">{contact.label}</p>
                                <p className="text-muted-foreground text-sm">
                                  {contact.number}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={5} className="resize-none" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button
            form="send-message"
            type="submit"
            disabled={!form.formState.isValid || sendingMessage}
          >
            {sendingMessage ? 'Sending' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendMessageDialog;
