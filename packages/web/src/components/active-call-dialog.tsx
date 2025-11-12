'use client';

import { getQueryClient } from '@/App';
import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

import { auth } from '@/lib/firebase';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

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

  // ⬇️ fetch companies so we can get the current company’s numbers
  const { data: companies } = useQuery({
    ...trpc.companies.getUserCompanies.queryOptions(),
    refetchOnWindowFocus: false,
  });

  const { mutateAsync: createCallLog } = useMutation(
    trpc.logs.createCallLog.mutationOptions()
  );
  const { mutateAsync: createContact } = useMutation(
    trpc.contacts.createContact.mutationOptions()
  );

  // ⬇️ transfer UI state
  const [transferTo, setTransferTo] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  const [callerId, setCallerId] = useState('Unknown');

  const normalizeNumber = (n?: string | null) =>
    (n ?? '').replace(/^client:/, '').trim();

  const counterpartyNumber = useMemo(() => {
    if (!activeCall) return null;
    if (activeCall.direction === 'OUTGOING') {
      return normalizeNumber(activeCall.customParameters.get('To'));
    }
    return normalizeNumber(activeCall.parameters.From);
  }, [activeCall]);

  useEffect(() => {
    if (!contacts?.length || !counterpartyNumber) return;
    const match = contacts.find((c) => c.number === counterpartyNumber);
    if (match) setCallerId(match.label || counterpartyNumber);
    else setCallerId('Unknown');
  }, [contacts, counterpartyNumber]);

  // ⬇️ derive transfer targets: all company numbers except the *current* active number
  const transferOptions = useMemo(() => {
    if (!companies || !activeCompany?.id) return [];
    const current = companies.find((c) => c.id === activeCompany.id);
    const numbers = current?.numbers ?? [];
    return numbers
      .filter((n) => n.id !== activeNumber?.id) // don’t show the current device/number
      .map((n) => ({ id: n.id, number: n.number, label: n.number }));
  }, [companies, activeCompany?.id, activeNumber?.id]);

  useEffect(() => {
    if (activeCall && callState === 'connected') {
      setOpen(true);

      const onDisconnect = async () => {
        let currentContact: any = null;
        const number = counterpartyNumber;

        if (number) {
          const existing = contacts?.find((c) => c.number === number);
          if (!existing) {
            currentContact = await createContact({
              number,
              label: number,
              companyId: activeCompany?.id as string,
            });
          } else {
            currentContact = existing;
          }
        }

        if (currentContact) {
          await createCallLog({
            numberId: activeNumber?.id as string,
            contactId: currentContact?.id as string,
            duration: callDuration,
            meta: {
              CallSid: activeCall.parameters.CallSid,
              Direction: activeCall.direction,
            },
            callSid: activeCall.parameters.CallSid,
          });
        }

        const client = getQueryClient();
        client.invalidateQueries({
          queryKey: trpc.logs.getNumberCallLogs.queryOptions({
            numberId: activeNumber?.id as string,
          }).queryKey,
        });
        client.invalidateQueries({
          queryKey: trpc.contacts.getCompanyContacts.queryOptions({
            companyId: activeCompany?.id as string,
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
    contacts,
    counterpartyNumber,
    createCallLog,
    createContact,
    trpc,
  ]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setCallDuration((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [open]);

  const toggleMute = () => {
    if (!activeCall) return;
    const next = !muted;
    activeCall.mute(next);
    setMuted(next);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const hangupAndCloseDialog = () => {
    hangUp();
    setOpen(false);
  };

  // ⬇️ action: call your cold transfer endpoint
  const handleColdTransfer = async () => {
    if (!activeCall || !transferTo) return;

    try {
      setIsTransferring(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/twilio/transfer/cold`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            callSid: activeCall.parameters.CallSid,
            to: transferTo,
            agentIdentity: activeNumber?.number,
          }),
        }
      );

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Transfer failed');
      }

      // typically the agent leg ends on a cold transfer—feel free to hang up the UI call:
      // hangUp();
    } catch (e) {
      console.error(e);
      // optionally toast error
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className={[
          'p-0 max-w-none h-[100dvh] w-[100vw] rounded-none',
          'flex flex-col',
          'sm:max-w-sm sm:h-auto sm:w-auto sm:rounded-lg sm:p-6',
          '[&>button:last-child]:hidden',
        ].join(' ')}
      >
        <DialogHeader
          className={[
            'px-4 pt-4 pb-2 sm:p-0',
            'border-b sm:border-0',
            'sticky top-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10',
          ].join(' ')}
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
        >
          <DialogTitle className="text-base sm:text-lg">
            📞 Call In Progress
          </DialogTitle>
          <div className="text-muted-foreground text-sm mt-1">
            Talking to: <span className="font-medium">{callerId}</span>
          </div>
          <div className="text-sm">
            Duration:{' '}
            <span className="font-mono">{formatDuration(callDuration)}</span>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0">
          {/* Dial pad */}
          <div className="grid grid-cols-3 gap-3 sm:gap-2 mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(
              (digit) => (
                <Button
                  key={digit}
                  variant="outline"
                  className="h-14 text-xl sm:h-10 sm:text-base"
                  onClick={() => activeCall?.sendDigits(digit)}
                >
                  {digit}
                </Button>
              )
            )}
          </div>

          {/* ⬇️ New: Cold transfer controls */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Transfer to</div>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a number" />
              </SelectTrigger>
              <SelectContent>
                {transferOptions.length === 0 ? (
                  <SelectItem value="x" disabled>
                    No other numbers available
                  </SelectItem>
                ) : (
                  transferOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.number}>
                      {opt.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                className="h-10"
                disabled={!transferTo || isTransferring}
                onClick={handleColdTransfer}
              >
                {isTransferring ? 'Transferring…' : 'Cold Transfer'}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter
          className={[
            'gap-2',
            'px-4 py-4 border-t',
            'sticky bottom-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60',
            'sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0',
            'flex flex-col sm:flex-row sm:justify-center',
          ].join(' ')}
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
        >
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <Button
              variant="secondary"
              className="h-12 text-base sm:h-9"
              onClick={toggleMute}
            >
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button
              variant="destructive"
              className="h-12 text-base sm:h-9"
              onClick={hangupAndCloseDialog}
            >
              End Call
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ActiveCallDialog;
