import { getQueryClient } from '@/App';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { Contact } from 'api/types/db';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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

type EditContactDialogProps = {
  open: boolean;
  onOpenChange: (flag: boolean) => void;
  selectedContact: Contact | null;
};

const schema = z.object({
  number: z.string().optional(),
  label: z.string().optional(),
});
function EditContactDialog({
  open,
  onOpenChange,
  selectedContact,
}: EditContactDialogProps) {
  const { activeCompany } = useMainStore();
  const trpc = useTRPC();
  const { mutateAsync, isPending } = useMutation(
    trpc.contacts.updateCompanyContact.mutationOptions()
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      number: selectedContact?.number,
      label: selectedContact?.label,
    },
  });

  useEffect(() => {
    if (selectedContact) {
      form.reset({
        number: selectedContact.number ?? '',
        label: selectedContact.label ?? '',
      });
    }
  }, [selectedContact, form]);

  async function onSubmit(data: z.infer<typeof schema>) {
    try {
      toast.info('Updating contact...');
      const update: {
        companyId: string;
        contactId: string;
        label: string;
        number: string;
      } = {
        companyId: activeCompany?.id as string,
        contactId: selectedContact?.id as string,
        label: '',
        number: '',
      };

      if (data.label) {
        update.label = data.label as string;
      }

      if (data.number) {
        update.number = data.number as string;
      }
      await mutateAsync(update);
      toast.success('Updated contact');
      onOpenChange(false);
      const client = getQueryClient();
      client.invalidateQueries({
        queryKey: trpc.contacts.getCompanyContacts.queryOptions({
          companyId: activeCompany?.id as string,
        }).queryKey,
      });
    } catch (error) {
      console.error(error);
      toast.error('Error updating contact');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Contact</DialogTitle>
          <DialogDescription>Update contact details</DialogDescription>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} id="edit-contact-form">
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
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
                    <FormLabel>Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+123456789" disabled />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button form="edit-contact-form" type="submit" disabled={isPending}>
              Submit
            </Button>
          </DialogFooter>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

export default EditContactDialog;
