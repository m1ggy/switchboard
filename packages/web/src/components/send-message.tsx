import useMainStore from '@/lib/store';
import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { z } from 'zod';
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
  message: z.string().min(1, 'Required'),
});

type Schema = z.infer<typeof schema>;

const contacts = [
  { name: 'Alice Johnson', phone: '+14155550101' },
  { name: 'Bob Smith', phone: '+14155550102' },
  { name: 'Charlie Wu', phone: '+14155550103' },
];

function SendMessageDialog() {
  const [mode, setMode] = useState<'phone' | 'contact'>('phone');

  const shown = useMainStore((state) => state.sendMessageModalShown);
  const setShown = useMainStore((state) => state.setSendMessageModalShown);

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: {
      recipient: '',
      message: '',
    },
  });

  const onSendMessage: SubmitHandler<Schema> = (data) => {
    console.log({ data });
  };

  return (
    <Dialog open={shown} onOpenChange={(open) => setShown(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send new message</DialogTitle>
          <DialogDescription>Send an SMS to a phone number</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            variant={mode === 'phone' ? 'default' : 'outline'}
            onClick={() => setMode('phone')}
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

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSendMessage)}
            id="send-message"
            className="space-y-8"
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
                        onChange={field.onChange}
                        value={field.value}
                      />
                    ) : (
                      <Command className="border rounded-md shadow-sm">
                        <CommandInput placeholder="Search contacts..." />
                        <CommandList>
                          <CommandEmpty>No contacts found.</CommandEmpty>
                          {contacts.map((contact) => (
                            <CommandItem
                              key={contact.phone}
                              value={contact.phone}
                              onSelect={() => {
                                field.onChange(contact.phone);
                              }}
                              className={clsx(
                                'cursor-pointer',
                                field.value == contact.phone &&
                                  ' bg-accent text-accent-foreground'
                              )}
                            >
                              <div>
                                <p className="font-medium">{contact.name}</p>
                                <p className="text-muted-foreground text-sm">
                                  {contact.phone}
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
                    <Textarea {...field} rows={5} className=" resize-none" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button form="send-message" disabled={!form.formState.isValid}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendMessageDialog;
