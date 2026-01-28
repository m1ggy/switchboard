'use client';

import { getQueryClient } from '@/App';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from './ui/button';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { PhoneInput } from './ui/phone-input';

const schema = z.object({
  label: z.string().min(1, 'Required'),
  number: z.string().min(1, 'Required'),
});

type Schema = z.infer<typeof schema>;

type Props = {
  onCreated?: (id: string) => void;
  /**
   * Optional: if you want parent to refresh after create
   */
  onSuccess?: () => void;
};

function CreateContactDialog({ onCreated, onSuccess }: Props) {
  const trpc = useTRPC();
  const queryClient = getQueryClient();

  const { activeCompany, activeNumber } = useMainStore();

  /**
   * ✅ createContactFull endpoint
   */
  const { mutateAsync: createContactFull, isPending: contactCreationLoading } =
    useMutation(trpc.contacts.createContact.mutationOptions());

  const { refetch: refetchContacts } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions({
      companyId: activeCompany?.id as string,
    })
  );

  const { refetch: refetchInboxes } = useQuery(
    trpc.inboxes.getNumberInboxes.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
  });

  const { setCreateContactModalShown, createContactModalShown } =
    useMainStore();

  const onSubmit: SubmitHandler<Schema> = async (data) => {
    try {
      if (!activeCompany) return;

      // If you're auto-creating schedules, we need activeNumber.
      if (!activeNumber) {
        toast.error('Please select a number first.');
        return;
      }

      const created = await createContactFull({
        label: data.label,
        number: data.number,
        companyId: activeCompany.id,
      });

      /**
       * ✅ invalidate contacts list
       */
      await queryClient.invalidateQueries({
        queryKey: trpc.contacts.getCompanyContacts.queryOptions({
          companyId: activeCompany.id,
        }).queryKey,
      });

      /**
       * ✅ invalidate new "profiles + schedules" list
       * This is what your dashboard uses now
       */
      await queryClient.invalidateQueries({
        queryKey:
          trpc.reassuranceContactProfiles.getAllWithSchedulesByCompanyId.queryOptions(
            {
              companyId: activeCompany.id,
            }
          ).queryKey,
      });

      // optional refetches
      await refetchContacts();
      await refetchInboxes();

      setCreateContactModalShown(false);
      toast.success('Contact created');

      if (created?.contact?.id) {
        onCreated?.(created.contact.id);
      }

      onSuccess?.();

      form.reset();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create contact');
    }
  };

  return (
    <Dialog
      open={createContactModalShown}
      onOpenChange={setCreateContactModalShown}
    >
      <DialogContent
        className="
          w-[100vw] max-w-none sm:max-w-lg md:max-w-xl
          h-[100dvh] sm:h-auto
          p-4 sm:p-6 md:p-8
          rounded-none sm:rounded-lg
          gap-4 sm:gap-6
          overflow-hidden
        "
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Create Contact</DialogTitle>
            <DialogDescription>
              Save a contact so you can quickly send them messages later.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 sm:mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                id="create-contact"
                className="space-y-4 sm:space-y-6"
              >
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. John from Sales"
                          autoComplete="name"
                          aria-label="Contact name"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter a name or label to help you recognize this contact
                        (e.g., “Sarah - IT Support”).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          aria-label="Phone number"
                          inputMode="tel"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </div>

        <DialogFooter
          className="
            sticky sm:static bottom-0 left-0 right-0
            -mx-4 sm:mx-0
            border-t sm:border-0
            bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
            p-4 sm:p-0
            pt-3 sm:pt-0
            pb-[max(1rem,env(safe-area-inset-bottom))]
          "
        >
          <Button
            form="create-contact"
            type="submit"
            disabled={contactCreationLoading}
            className="w-full sm:w-auto"
          >
            {contactCreationLoading ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateContactDialog;
