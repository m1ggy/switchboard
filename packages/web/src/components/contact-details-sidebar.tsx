import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Building2,
  Check,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { Textarea } from './ui/textarea';
import TooltipStandalone from './ui/tooltip-standalone';

type ContactDetailsSidebarProps = {
  contactId: string;
  onClose?: () => void;
};

type DetailsDraft = {
  email: string;
  alternate_number: string;
  organization: string;
  address: string;
};

const EMPTY_DRAFT: DetailsDraft = {
  email: '',
  alternate_number: '',
  organization: '',
  address: '',
};

function formatNoteDate(value?: string | Date | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ContactDetailsSidebar({
  contactId,
  onClose,
}: ContactDetailsSidebarProps) {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();

  const {
    data: contact,
    isLoading: isContactLoading,
    refetch: refetchContact,
  } = useQuery(trpc.contacts.findContactById.queryOptions({ contactId }));

  // ---------------- Contact info ----------------
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [draft, setDraft] = useState<DetailsDraft>(EMPTY_DRAFT);

  useEffect(() => {
    setIsEditingDetails(false);
  }, [contactId]);

  useEffect(() => {
    if (isEditingDetails) return;
    setDraft({
      email: contact?.email ?? '',
      alternate_number: contact?.alternate_number ?? '',
      organization: contact?.organization ?? '',
      address: contact?.address ?? '',
    });
  }, [contact, isEditingDetails]);

  const { mutateAsync: updateDetails, isPending: isSavingDetails } =
    useMutation(trpc.contacts.updateContactDetails.mutationOptions());

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateDetails({ contactId, ...draft });
      await refetchContact();
      setIsEditingDetails(false);
      toast.success('Contact updated');
    } catch (err) {
      console.error('Failed to update contact details', err);
      toast.error(
        err instanceof Error && err.message.toLowerCase().includes('email')
          ? 'Please enter a valid email address'
          : 'Failed to update contact'
      );
    }
  }

  // ---------------- Notes ----------------
  const {
    data: notes,
    isLoading: isNotesLoading,
    refetch: refetchNotes,
  } = useQuery(trpc.notes.getContactNotes.queryOptions({ contactId }));

  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  useEffect(() => {
    setNewNote('');
    setEditingNoteId(null);
  }, [contactId]);

  const { mutateAsync: createNote, isPending: isCreatingNote } = useMutation(
    trpc.notes.createNote.mutationOptions()
  );
  const { mutateAsync: editNote, isPending: isEditingNote } = useMutation(
    trpc.notes.editNote.mutationOptions()
  );
  const { mutateAsync: deleteNote } = useMutation(
    trpc.notes.deleteNote.mutationOptions()
  );

  async function handleAddNote(e?: React.FormEvent) {
    e?.preventDefault();
    const text = newNote.trim();
    if (!text || !contact) return;
    if (!activeNumber?.id) {
      toast.error('Select a number before adding notes');
      return;
    }
    try {
      await createNote({
        note: text,
        contact_id: contactId,
        number_id: activeNumber.id,
        company_id: contact.company_id,
      });
      setNewNote('');
      await refetchNotes();
    } catch (err) {
      console.error('Failed to add note', err);
      toast.error('Failed to add note');
    }
  }

  async function handleSaveNote(noteId: string) {
    const text = editingNoteText.trim();
    if (!text) return;
    try {
      await editNote({ noteId, note: text });
      setEditingNoteId(null);
      await refetchNotes();
    } catch (err) {
      console.error('Failed to edit note', err);
      toast.error('Failed to update note');
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteNote({ noteId });
      await refetchNotes();
    } catch (err) {
      console.error('Failed to delete note', err);
      toast.error('Failed to delete note');
    }
  }

  const infoRows: {
    key: keyof DetailsDraft;
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    type?: string;
  }[] = [
    {
      key: 'email',
      label: 'Email',
      icon: <Mail className="h-3.5 w-3.5" />,
      placeholder: 'name@example.com',
      type: 'email',
    },
    {
      key: 'alternate_number',
      label: 'Alternate phone',
      icon: <Phone className="h-3.5 w-3.5" />,
      placeholder: '+1 555 123 4567',
      type: 'tel',
    },
    {
      key: 'organization',
      label: 'Organization',
      icon: <Building2 className="h-3.5 w-3.5" />,
      placeholder: 'Company or organization',
    },
    {
      key: 'address',
      label: 'Address',
      icon: <MapPin className="h-3.5 w-3.5" />,
      placeholder: 'Street, city, state',
    },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="h-12 px-4 border-b flex items-center justify-between flex-shrink-0">
        <span className="font-medium text-sm">Contact details</span>
        {onClose && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Close contact details"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Identity */}
        <div className="px-4 py-4 flex flex-col items-center text-center gap-1">
          {isContactLoading ? (
            <>
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-4 w-32 mt-2" />
              <Skeleton className="h-3 w-24" />
            </>
          ) : (
            <>
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold uppercase">
                {(contact?.label ?? '?').trim().charAt(0) || '?'}
              </div>
              <span className="font-semibold mt-2 break-all">
                {contact?.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {contact?.number}
              </span>
            </>
          )}
        </div>

        <Separator />

        {/* Contact info */}
        <section className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Contact info
            </Label>
            {!isEditingDetails && !isContactLoading && (
              <TooltipStandalone content="Edit contact info">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setIsEditingDetails(true)}
                  aria-label="Edit contact info"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </TooltipStandalone>
            )}
          </div>

          {isEditingDetails ? (
            <form onSubmit={handleSaveDetails} className="space-y-3">
              {infoRows.map((row) => (
                <div key={row.key} className="space-y-1">
                  <Label
                    htmlFor={`contact-${row.key}`}
                    className="text-xs flex items-center gap-1.5"
                  >
                    {row.icon}
                    {row.label}
                  </Label>
                  {row.key === 'address' ? (
                    <Textarea
                      id={`contact-${row.key}`}
                      value={draft[row.key]}
                      placeholder={row.placeholder}
                      rows={2}
                      className="text-sm resize-none"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [row.key]: e.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      id={`contact-${row.key}`}
                      type={row.type ?? 'text'}
                      value={draft[row.key]}
                      placeholder={row.placeholder}
                      className="h-8 text-sm"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [row.key]: e.target.value }))
                      }
                    />
                  )}
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingDetails(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSavingDetails}>
                  {isSavingDetails && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  Save
                </Button>
              </div>
            </form>
          ) : (
            <dl className="space-y-2.5">
              {infoRows.map((row) => {
                const value = contact?.[row.key];
                return (
                  <div key={row.key} className="flex gap-2 text-sm">
                    <dt
                      className="text-muted-foreground mt-0.5"
                      title={row.label}
                    >
                      {row.icon}
                    </dt>
                    <dd className="min-w-0 flex-1">
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        {row.label}
                      </div>
                      {value ? (
                        row.key === 'email' ? (
                          <a
                            href={`mailto:${value}`}
                            className="break-all hover:underline"
                          >
                            {value}
                          </a>
                        ) : (
                          <span className="break-words whitespace-pre-wrap">
                            {value}
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          className="text-muted-foreground/70 italic hover:text-foreground"
                          onClick={() => setIsEditingDetails(true)}
                        >
                          Add {row.label.toLowerCase()}
                        </button>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </section>

        <Separator />

        {/* Notes */}
        <section className="px-4 py-4 space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </Label>

          <form onSubmit={handleAddNote} className="space-y-2">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note about this contact…"
              rows={3}
              className="text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={!newNote.trim() || isCreatingNote || !contact}
            >
              {isCreatingNote && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              Add note
            </Button>
          </form>

          {isNotesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : !notes?.length ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No notes yet
            </p>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="group rounded-md border bg-muted/40 p-2.5 text-sm"
                >
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        rows={3}
                        autoFocus
                        className="text-sm resize-none bg-background"
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingNoteId(null)}
                          aria-label="Cancel edit"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={!editingNoteText.trim() || isEditingNote}
                          onClick={() => handleSaveNote(note.id)}
                          aria-label="Save note"
                        >
                          {isEditingNote ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap break-words">
                        {note.note}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          {formatNoteDate(note.created_at)}
                          {note.updated_at ? ' · edited' : ''}
                          {note.call_sid || note.room_id ? ' · from call' : ''}
                        </span>
                        <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingNoteText(note.note);
                            }}
                            aria-label="Edit note"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteNote(note.id)}
                            aria-label="Delete note"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default ContactDetailsSidebar;
