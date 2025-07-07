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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Contact</DialogTitle>
          <DialogDescription>
            Save a contact so you can quickly send them messages later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            id="create-contact"
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. John from Sales" />
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
                    <PhoneInput {...field} disablePortal />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button
            form="create-contact"
            type="submit"
            disabled={contactCreationLoading}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateContactDialog;
