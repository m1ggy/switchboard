'use client';

import clsx from 'clsx';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';

import { contactSchema, type Contact } from '@/lib/schemas';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { getQueryClient } from '@/App';
import { Plus, X } from 'lucide-react';

interface ContactFormProps {
  onSubmit: (data: Contact) => void;
  mode?: 'select' | 'create';
}

/**
 * We reuse your schema from contactSchema but make it RHF-friendly
 */
type CreateContactSchema = z.infer<typeof contactSchema>;

export default function ContactForm({ onSubmit }: ContactFormProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

  const trpc = useTRPC();
  const queryClient = getQueryClient();
  const { activeCompany } = useMainStore();

  const {
    data: contacts,
    isLoading: contactsLoading,
    refetch: refetchContacts,
  } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions({
      companyId: activeCompany?.id as string,
    })
  );

  const { mutateAsync: createContact, isPending: creating } = useMutation(
    trpc.contacts.createContact.mutationOptions()
  );

  const selectedContact = contacts?.find((c) => c.id === selectedContactId);

  const handleSelectContact = (contactId: string) => {
    const contact = contacts?.find((c) => c.id === contactId);
    if (contact) {
      setSelectedContactId(contactId);
      onSubmit(contact);
    }
  };

  const form = useForm<CreateContactSchema>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      label: '',
      number: '',
    },
  });

  const onCreate: SubmitHandler<CreateContactSchema> = async (data) => {
    try {
      if (!activeCompany?.id) return;

      const created = await createContact({
        label: data.label,
        number: data.number,
        companyId: activeCompany.id,
      });

      await queryClient.invalidateQueries({
        queryKey: trpc.contacts.getCompanyContacts.queryOptions({
          companyId: activeCompany.id,
        }).queryKey,
      });

      await refetchContacts();

      toast.success('Contact created');

      // ✅ auto select and submit newly created contact
      if (created?.id) {
        setSelectedContactId(created.id);
      }

      onSubmit(created);
      form.reset();
      setMode('select');
    } catch {
      toast.error('Failed to create contact');
    }
  };

  return (
    <div className="space-y-6">
      {/* MODE TOGGLE */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'select' ? 'default' : 'outline'}
          onClick={() => setMode('select')}
          className="flex-1"
        >
          Select Existing
        </Button>
        <Button
          type="button"
          variant={mode === 'create' ? 'default' : 'outline'}
          onClick={() => setMode('create')}
          className="flex-1"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create New
        </Button>
      </div>

      {/* SELECT MODE */}
      {mode === 'select' ? (
        <div className="space-y-4">
          <Label>Select a Contact</Label>

          {/* Selected Contact Banner */}
          {selectedContactId && selectedContact && (
            <div className="flex items-center justify-between text-sm text-green-600 font-medium px-1">
              <span>
                {selectedContact.label} — {selectedContact.number}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedContactId(null)}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>
          )}

          {/* ✅ CORRECT CONTACT SELECT (Command Search Picker) */}
          <Command className="border rounded-md shadow-sm">
            <CommandInput placeholder="Search contacts..." />
            <CommandList>
              <CommandEmpty>
                {contactsLoading ? 'Loading contacts...' : 'No contacts found.'}
              </CommandEmpty>

              {contacts?.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.label} ${contact.number}`}
                  onSelect={() => handleSelectContact(contact.id)}
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

          <p className="text-sm text-muted-foreground">
            {contacts?.length ?? 0} contact
            {(contacts?.length ?? 0) !== 1 ? 's' : ''} available
          </p>
        </div>
      ) : (
        // ✅ CORRECT CREATE CONTACT (RHF + Zod + TRPC)
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <PhoneInput
                      {...field}
                      disablePortal
                      inputMode="tel"
                      aria-label="Phone number"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Label</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Home, Mobile, Work"
                      aria-label="Contact label"
                    />
                  </FormControl>
                  <FormDescription>
                    Add a label so you can recognize this contact later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={creating} className="w-full">
              {creating ? 'Creating...' : 'Create Contact'}
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}
