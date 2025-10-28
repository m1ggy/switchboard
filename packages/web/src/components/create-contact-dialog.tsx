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

function CreateContactDialog() {
  const trpc = useTRPC();
  const queryClient = getQueryClient();

  const { activeCompany, activeNumber } = useMainStore();
  const { mutateAsync: createContact, isPending: contactCreationLoading } =
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
      if (activeCompany) {
        await createContact({
          number: data.number,
          label: data.label,
          companyId: activeCompany?.id as string,
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.contacts.getCompanyContacts.queryOptions({
            companyId: activeCompany.id as string,
          }).queryKey,
        });
        await refetchContacts();
        await refetchInboxes();
        setCreateContactModalShown(false);
        toast.success('Contact created');
      }
    } catch {
      toast.error('Failed to create contact');
    }
  };

  return (
    <Dialog
      open={createContactModalShown}
      onOpenChange={setCreateContactModalShown}
    >
      <DialogContent
        // Mobile-first: full-height sheet style with internal scrolling;
        // desktop: regular centered dialog with larger padding and rounded corners
        className="
          w-[100vw] max-w-none sm:max-w-lg md:max-w-xl
          h-[100dvh] sm:h-auto
          p-4 sm:p-6 md:p-8
          rounded-none sm:rounded-lg
          gap-4 sm:gap-6
          overflow-hidden
        "
      >
        {/* Scrollable body section so header/footer stay visible on mobile */}
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
                          // Helps mobile keyboards show the numeric pad
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

        {/* Sticky footer on mobile; normal footer spacing on larger screens */}
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
            // Easier to tap on mobile
            className="w-full sm:w-auto"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateContactDialog;
