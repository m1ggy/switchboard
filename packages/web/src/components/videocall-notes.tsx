import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from './ui/button';
import { FormField } from './ui/form';
import { Textarea } from './ui/textarea';

const schema = z.object({
  note: z.string(),
});

type VideoCallNotesProps = {
  contactId: string;
  roomId: string;
};
function VideoCallNotes({ contactId, roomId }: VideoCallNotesProps) {
  const trpc = useTRPC();
  const { activeNumber, activeCompany } = useMainStore();
  const { mutateAsync, isPending } = useMutation(
    trpc.notes.createNote.mutationOptions()
  );
  const { data: notes, refetch: refetchNotes } = useQuery(
    trpc.notes.getContactNotes.queryOptions({ contactId: contactId })
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      note: '',
    },
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    console.log({ data });
    try {
      await mutateAsync({
        number_id: activeNumber?.id as string,
        contact_id: contactId,
        company_id: activeCompany?.id as string,
        note: data.note,
        room_id: roomId,
      });

      toast.success('Note added');
      form.reset();
      await refetchNotes();
    } catch (error) {
      toast.error('Failed to add note');
    }
  };
  return (
    <div>
      <form className="space-y-2" onSubmit={form.handleSubmit(onSubmit)}>
        <h3 className="font-semibold text-lg">Notes</h3>
        <FormField
          name="note"
          control={form.control}
          render={({ field }) => (
            <Textarea placeholder="Write notes here..." {...field} />
          )}
        />
        <Button size="sm" className="mt-1 w-full" disabled={isPending}>
          Add Note
        </Button>
      </form>
      <div>
        {notes?.map((note) => (
          <div>
            <span>{note.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VideoCallNotes;
