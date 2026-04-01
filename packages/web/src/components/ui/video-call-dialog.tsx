'use client';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { useJitsi } from '@/hooks/jitsi-provider';
import useMainStore from '@/lib/store';
import { useVideoCallStore } from '@/lib/stores/videocall';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type VideoCallDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

export default function VideoCallDialog({
  open,
  onOpenChange,
}: VideoCallDialogProps) {
  const trpc = useTRPC();
  const { activeCompany, activeNumber, setActiveVideoCallDialogShown } =
    useMainStore();
  const { setCurrentCallContactId } = useVideoCallStore();
  const { createRoom } = useJitsi();

  const [mode, setMode] = useState<'phone' | 'contact'>('phone');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const { data: contacts } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions(
      { companyId: activeCompany?.id as string },
      { enabled: !!activeCompany?.id }
    )
  );

  const selectedContact = useMemo(
    () => contacts?.find((c) => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  useEffect(() => {
    if (!open) {
      setMode('phone');
      setSelectedContactId(null);
      setNumber('');
      setLabel('');
      setIsStarting(false);
    }
  }, [open]);

  useEffect(() => {
    if (selectedContact) {
      setNumber(selectedContact.number ?? '');
      setLabel(selectedContact.label ?? '');
    }
  }, [selectedContact]);

  const { mutateAsync: createContact } = useMutation(
    trpc.contacts.createContact.mutationOptions()
  );

  const { mutateAsync: ensureInbox } = useMutation(
    trpc.inboxes.createInboxIfNotExists.mutationOptions()
  );

  const canSubmit =
    !!activeCompany?.id &&
    !!activeNumber?.id &&
    normalizePhone(number).length > 0 &&
    !isStarting;

  const handleStart = async () => {
    if (!activeCompany?.id || !activeNumber?.id || !number.trim()) return;

    setIsStarting(true);

    try {
      let contactId = selectedContactId;

      if (!contactId) {
        const normalizedInput = normalizePhone(number);
        const existing =
          contacts?.find(
            (c) => normalizePhone(c.number || '') === normalizedInput
          ) ?? null;

        if (existing) {
          contactId = existing.id;
        } else {
          const created = await createContact({
            companyId: activeCompany.id,
            number: number.trim(),
            label: label.trim() || number.trim(),
          });

          contactId = created.id;
        }
      }

      if (!contactId) {
        throw new Error('No contact found');
      }

      await ensureInbox({
        companyId: activeCompany.id,
        numberId: activeNumber.id,
        contactId,
      });

      setCurrentCallContactId(contactId);
      await createRoom(contactId);
      setActiveVideoCallDialogShown(true);

      toast.success('Video call started');
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to start video call');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-2">
          <DialogTitle>Start Video Call</DialogTitle>
          <DialogDescription>
            Enter a number or choose a contact to begin.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 pb-4 space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
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
              size="sm"
              className="flex-1"
              variant={mode === 'contact' ? 'default' : 'outline'}
              onClick={() => setMode('contact')}
            >
              Contacts
            </Button>
          </div>

          <div className="grid gap-2">
            <Label>Number</Label>

            {mode === 'phone' ? (
              <PhoneInput
                value={number}
                onChange={(val) => setNumber(val)}
                placeholder="+1 (555) 123-4567"
                disablePortal
              />
            ) : (
              <Command className="border rounded-md">
                <CommandInput placeholder="Search contacts..." />
                <CommandList>
                  <CommandEmpty>No contacts found.</CommandEmpty>
                  {contacts?.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.label} ${c.number}`}
                      onSelect={() => {
                        setSelectedContactId(c.id);
                        setNumber(c.number);
                        setLabel(c.label || '');
                      }}
                    >
                      <div>
                        <p className="font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.number}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Contact Name (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t">
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isStarting}
              className="flex-1"
            >
              Cancel
            </Button>

            <Button
              onClick={handleStart}
              disabled={!canSubmit}
              className="flex-1"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4 mr-2" />
                  Start Call
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
