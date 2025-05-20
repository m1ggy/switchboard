import useMainStore from '@/lib/store';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler } from 'react-hook-form';
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
  const form = useForm<Schema>({
    resolver: zodResolver(schema),
  });
  const { setCreateContactModalShown, createContactModalShown } =
    useMainStore();

  const onSubmit: SubmitHandler<Schema> = (data) => {
    console.log({ data });
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
                    <PhoneInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button form="create-contact" type="submit">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateContactDialog;
