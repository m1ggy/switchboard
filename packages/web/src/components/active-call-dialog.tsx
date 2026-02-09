'use client';

import { getQueryClient } from '@/App';
import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
// adjust this import to wherever your Firebase auth is exported from
import { auth } from '@/lib/firebase';

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

  // transfer UI state
  const [transferTo, setTransferTo] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false); // cold

  // warm transfer state
  const [isWarmBusy, setIsWarmBusy] = useState(false);
  const [warmActive, setWarmActive] = useState(false);
  const [isCompletingWarm, setIsCompletingWarm] = useState(false);
  const [warmError, setWarmError] = useState<string | null>(null);

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

  // derive transfer targets: all company numbers except the current active number
  const transferOptions = useMemo(() => {
    if (!companies) return [];

    const seen = new Set<string>(); // de-dupe by number
    const opts: Array<{
      id: string;
      number: string;
      label: string;
      companyId: string;
      companyName: string;
      numberId: string;
    }> = [];

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

  // =========================
  // ✅ Wake Lock integration
  // =========================
  const wakeLockRef = useRef<any>(null);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);

  useEffect(() => {
    setWakeLockSupported(
      typeof window !== 'undefined' && 'wakeLock' in navigator
    );
  }, []);

  // Request wake lock while call is active, and re-request on visibility changes
  useEffect(() => {
    if (!open || callState !== 'connected') return;

    let cancelled = false;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;

      try {
        // @ts-expect-error - Wake Lock API may not be in TS lib depending on setup
        const sentinel = await navigator.wakeLock.request('screen');

        if (cancelled) {
          await sentinel.release().catch(() => {});
          return;
        }

        wakeLockRef.current = sentinel;

        sentinel.addEventListener?.('release', () => {
          wakeLockRef.current = null;
        });
      } catch (err) {
        // Often NotAllowedError if no user gesture (esp. on incoming calls)
        console.warn('Wake lock request failed:', err);
      }
    };

    const releaseWakeLock = async () => {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel) {
        await sentinel.release().catch(() => {});
      }
    };

    // Initial request
    requestWakeLock();

    // Re-request when visible again (locks often drop when hidden)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
      else releaseWakeLock();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseWakeLock();
    };
  }, [open, callState]);

  // Also release wake lock if the dialog is force-closed while connected (belt & suspenders)
  useEffect(() => {
    if (open) return;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel) {
      sentinel.release?.().catch?.(() => {});
    }
  }, [open]);

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

        // reset warm transfer state
        setWarmActive(false);
        setIsWarmBusy(false);
        setIsCompletingWarm(false);
        setWarmError(null);
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

  // 🔹 Cold transfer, using your fetch pattern
  const doColdTransfer = async () => {
    if (!transferTo || !activeCall || !activeNumber?.number) return;

    try {
      setIsTransferring(true);

      const callSid = activeCall.parameters.CallSid;
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
            callSid, // backend can fall back using agentIdentity if needed
            to: transferTo,
            agentIdentity: activeNumber.number,
          }),
        }
      );

      // after cold transfer, we typically hang up our leg
      hangUp();
    } catch (e) {
      console.error('Cold transfer failed', e);
    } finally {
      setIsTransferring(false);
    }
  };

  // 🔥 Warm transfer (create conference + add target) with same pattern
  const doWarmTransfer = async () => {
    if (!transferTo || !activeCall || !activeNumber?.number) return;

    setWarmError(null);
    setIsWarmBusy(true);

    try {
      const callSid = activeCall.parameters.CallSid;
      const token = await auth.currentUser?.getIdToken();

      // 1) upgrade current call to warm conference
      const res1 = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/twilio/transfer/warm/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            callSid,
            agentIdentity: activeNumber.number,
          }),
        }
      );

      if (!res1.ok) {
        const data = await res1.json().catch(() => null);
        throw new Error(data?.error || 'Failed to start warm transfer');
      }

      // 2) add the chosen target into the warm conference
      const res2 = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/twilio/transfer/warm/add-party`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            callSid,
            to: transferTo,
          }),
        }
      );

      if (!res2.ok) {
        const data = await res2.json().catch(() => null);
        throw new Error(data?.error || 'Failed to add party to warm transfer');
      }

      setWarmActive(true);
    } catch (e: any) {
      console.error('Warm transfer failed', e);
      setWarmError(e?.message || 'Warm transfer failed');
      setWarmActive(false);
    } finally {
      setIsWarmBusy(false);
    }
  };

  // ✅ Complete warm transfer: drop this agent from 3-way
  const completeWarmTransfer = async () => {
    if (!activeCall || !activeNumber?.number) return;

    setWarmError(null);
    setIsCompletingWarm(true);

    try {
      const callSid = activeCall.parameters.CallSid;
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/twilio/transfer/warm/complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            callSid,
            agentIdentity: activeNumber.number,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to complete warm transfer');
      }

      // Twilio should disconnect our leg; onDisconnect handler will clean up UI
    } catch (e: any) {
      console.error('Complete warm transfer failed', e);
      setWarmError(e?.message || 'Failed to complete warm transfer');
    } finally {
      setIsCompletingWarm(false);
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

          {/* Optional info to indicate wake lock attempt */}
          {wakeLockSupported && callState === 'connected' && (
            <div className="text-xs text-muted-foreground mt-1">
              Screen will stay awake during this call
            </div>
          )}
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

          {/* Transfer controls */}
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

            {warmError && (
              <div className="text-xs text-destructive">{warmError}</div>
            )}

            <div className="flex flex-wrap gap-2">
              {/* Cold transfer */}
              <Button
                className="h-10"
                variant="outline"
                disabled={
                  !transferTo || isTransferring || callState !== 'connected'
                }
                onClick={doColdTransfer}
              >
                {isTransferring ? 'Transferring…' : 'Cold Transfer'}
              </Button>

              {/* Warm transfer */}
              <Button
                className="h-10"
                disabled={!transferTo || isWarmBusy || warmActive}
                onClick={doWarmTransfer}
              >
                {isWarmBusy ? 'Starting Warm…' : 'Warm Transfer'}
              </Button>

              {/* Complete warm (drop myself) */}
              <Button
                className="h-10"
                variant="secondary"
                disabled={!warmActive || isCompletingWarm}
                onClick={completeWarmTransfer}
              >
                {isCompletingWarm ? 'Completing…' : 'Complete Warm Transfer'}
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
