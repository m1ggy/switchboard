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
import { useMemo } from 'react';

export function IncomingCallDialog() {
  const {
    incomingCall,
    acceptIncoming,
    rejectIncoming,
    callState,
    activeCall,
  } = useTwilioVoice();

  const open = callState === 'incoming' && !!incomingCall && !activeCall;

  // Normalize/clean the From number (e.g., strip "client:")
  const fromLabel = useMemo(() => {
    const raw = incomingCall?.parameters?.From ?? 'Unknown';
    return typeof raw === 'string' ? raw.replace(/^client:/, '') : 'Unknown';
  }, [incomingCall?.parameters?.From]);

  return (
    <Dialog open={open}>
      <DialogContent
        // Mobile: full-screen sheet; Desktop+: compact dialog
        className={[
          'p-0 max-w-none h-[100dvh] w-[100vw] rounded-none',
          'flex flex-col',
          'sm:max-w-sm sm:h-auto sm:w-auto sm:rounded-lg sm:p-6',
          // hide default close button
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

        {/* Body (room for future details) */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:p-0">
          <div className="mx-auto max-w-xs text-center text-sm text-muted-foreground">
            Tap a button below to accept or reject the call.
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
