'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTwilioVoice } from '@/hooks/twilio-provider';
import { useMemo, useState } from 'react';

import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

// shadcn/ui Select
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { auth } from '@/lib/firebase';

export function IncomingCallDialog() {
  const {
    incomingCall,
    acceptIncoming,
    rejectIncoming,
    callState,
    activeCall,
  } = useTwilioVoice();

  const { activeCompany, activeNumber } = useMainStore();
  const trpc = useTRPC();

  // Load companies so we can list numbers for the active company
  const { data: companies } = useQuery({
    ...trpc.companies.getUserCompanies.queryOptions(),
    refetchOnWindowFocus: false,
  });

  const open = callState === 'incoming' && !!incomingCall && !activeCall;

  // Normalize/clean the From number (e.g., strip "client:")
  const normalizedFrom = useMemo(() => {
    const raw = incomingCall?.parameters?.From ?? 'Unknown';
    return typeof raw === 'string' ? raw.replace(/^client:/, '') : 'Unknown';
  }, [incomingCall?.parameters?.From]);

  // 🔎 NEW: look up contact label using your new TRPC endpoint
  const { data: foundContact } = useQuery({
    ...trpc.contacts.findContactByNumber.queryOptions({
      number: normalizedFrom,
      companyId: activeCompany?.id as string,
    }),
    enabled:
      open &&
      !!activeCompany?.id &&
      !!normalizedFrom &&
      normalizedFrom !== 'Unknown',
    refetchOnWindowFocus: false,
  });

  const fromLabel = foundContact?.label ?? normalizedFrom;

  // Build transfer options: all numbers for the active company except the currently active number
  const transferOptions = useMemo(() => {
    if (!companies) return [];

    const seen = new Set<string>(); // de-dupe by number
    const opts = [];

    for (const c of companies) {
      const nums = c?.numbers ?? [];
      for (const n of nums) {
        // skip the number you're currently using
        if (n.id === activeNumber?.id) continue;

        // de-dupe by actual phone number value
        if (seen.has(n.number)) continue;
        seen.add(n.number);

        // include company context in label and a composite id to avoid collisions
        opts.push({
          id: `${c.id}:${n.id}`,
          number: n.number,
          label: `${n.number} — ${c.name}`,
          companyId: c.id,
          companyName: c.name,
          numberId: n.id,
        });
      }
    }

    return opts;
  }, [companies, activeNumber?.id]);

  // Transfer state
  const [transferTo, setTransferTo] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  const doColdTransfer = async () => {
    if (!transferTo) return;

    try {
      setIsTransferring(true);

      // Prefer the incoming leg CallSid if present
      const callSid = incomingCall?.parameters?.CallSid;
      const token = await auth.currentUser?.getIdToken();

      await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/twilio/transfer/cold`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            callSid, // may be undefined; backend can fallback using agentIdentity
            to: transferTo,
            agentIdentity: activeNumber?.number, // helps the server resolve the correct leg
          }),
        }
      );
    } catch (e) {
      console.error('Cold transfer failed', e);
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
        {/* Sticky header */}
        <DialogHeader
          className={[
            'px-4 pt-4 pb-2 sm:p-0',
            'border-b sm:border-0',
            'sticky top-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10',
          ].join(' ')}
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
        >
          <DialogTitle className="text-base sm:text-lg">
            📞 Incoming Call
          </DialogTitle>
          <p className="text-muted-foreground text-sm mt-1">
            From: <span className="font-medium">{fromLabel}</span>
          </p>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:p-0">
          <div className="mx-auto max-w-xs text-center text-sm text-muted-foreground mb-6">
            Tap a button below to accept or reject the call. Or transfer it
            without answering.
          </div>

          {/* Transfer without answering */}
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
            <div className="flex justify-center">
              <Button
                className="h-10"
                disabled={!transferTo || isTransferring}
                onClick={doColdTransfer}
              >
                {isTransferring
                  ? 'Transferring…'
                  : 'Transfer without answering'}
              </Button>
            </div>
          </div>
        </div>

        {/* Sticky footer controls */}
        <DialogFooter
          className={[
            'px-4 py-4 border-t',
            'sticky bottom-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60',
            'sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0',
            'flex flex-col sm:flex-row sm:justify-center gap-3',
          ].join(' ')}
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
        >
          <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
            <Button
              variant="destructive"
              className="h-14 text-base sm:h-9"
              onClick={rejectIncoming}
            >
              Reject
            </Button>
            <Button className="h-14 text-base sm:h-9" onClick={acceptIncoming}>
              Accept
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
