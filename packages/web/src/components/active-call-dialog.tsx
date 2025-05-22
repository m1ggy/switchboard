'use client';

import { getQueryClient } from '@/App';
import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

function ActiveCallDialog() {
  const trpc = useTRPC();
  const { activeCall, callState, hangUp, setActiveCall } = useTwilioVoice();
  const [callDuration, setCallDuration] = useState(0);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const { activeCompany, activeNumber } = useMainStore();
  const { data: contacts } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions({
      companyId: activeCompany?.id as string,
    })
  );

  const { mutateAsync: createCallLog } = useMutation(
    trpc.logs.createCallLog.mutationOptions()
  );
  const { mutateAsync: createContact } = useMutation(
    trpc.contacts.createContact.mutationOptions()
  );

  const [callerId, setCallerId] = useState('Unknown');

  console.log({ activeCall });

  useEffect(() => {
    if (!activeCall) return;
    if (!contacts) return;
    if (!contacts?.length) return;

    if (activeCall.direction === 'OUTGOING') {
      const callTo = activeCall.customParameters.get('To');

      if (!callTo) return;

      const matchingContact = contacts.find(
        (contact) => contact.number === callTo
      );

      if (!matchingContact) return;

      setCallerId(matchingContact.label);
    } else {
      const callTo = activeCall.parameters.From;
      if (!callTo) return;

      const matchingContact = contacts.find(
        (contact) => contact.number === callTo
      );

      if (!matchingContact) return;

      setCallerId(matchingContact.label);
    }
  }, [activeCall, callerId, contacts]);

  useEffect(() => {
    if (activeCall && callState === 'connected') {
      setOpen(true);

      const onDisconnect = async () => {
        let currentContact = null;

        if (callerId === 'Unknown') {
          let number = null;
          if (activeCall.direction === 'OUTGOING') {
            const callTo = activeCall.customParameters.get('To');

            number = callTo;
          } else {
            const callTo = activeCall.parameters.From;
            number = callTo;
          }
          if (number)
            currentContact = await createContact({
              number,
              label: number,
              companyId: activeCompany?.id as string,
            });
        } else {
          let number = null;
          if (activeCall.direction === 'OUTGOING') {
            const callTo = activeCall.customParameters.get('To');

            number = callTo;
          } else {
            const callTo = activeCall.parameters.From;
            number = callTo;
          }
          if (number) {
            const matchingContact = contacts?.find(
              (contact) => contact.number === number
            );

            if (matchingContact) {
              currentContact = matchingContact;
            }
          }
        }

        await createCallLog({
          numberId: activeNumber?.id as string,
          contactId: currentContact?.id as string,
          duration: callDuration,
          meta: { CallSid: activeCall.parameters.CallSid },
        });

        getQueryClient().invalidateQueries({
          queryKey: trpc.logs.getNumberCallLogs.queryOptions({
            numberId: activeNumber?.id as string,
          }).queryKey,
        });
        setOpen(false);
        setMuted(false);
        setCallDuration(0);
        setActiveCall(null);
      };

      activeCall.on('disconnect', onDisconnect);
      activeCall.on('error', onDisconnect);

      return () => {
        activeCall.off('disconnect', onDisconnect);
        activeCall.off('error', onDisconnect);
      };
    }
  }, [
    activeCall,
    callState,
    setActiveCall,
    activeCompany?.id,
    activeNumber?.id,
    callDuration,
    callerId,
    contacts,
    createCallLog,
    createContact,
    trpc,
  ]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  const toggleMute = () => {
    if (!activeCall) return;
    const nextState = !muted;
    activeCall.mute(nextState);
    setMuted(nextState);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <Dialog open={open}>
      <DialogContent className="text-center max-w-sm">
        <DialogHeader>
          <DialogTitle>📞 Call In Progress</DialogTitle>
        </DialogHeader>

        <div className="text-muted-foreground text-sm mb-2">
          Talking to: <span className="font-medium">{callerId}</span>
        </div>

        <div className="text-sm mb-4">
          Duration:{' '}
          <span className="font-mono">{formatDuration(callDuration)}</span>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row justify-center">
          <Button variant="secondary" onClick={toggleMute}>
            {muted ? 'Unmute' : 'Mute'}
          </Button>
          <Button variant="destructive" onClick={hangUp}>
            End Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ActiveCallDialog;
