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

export function IncomingCallDialog() {
  const {
    incomingCall,
    acceptIncoming,
    rejectIncoming,
    callState,
    activeCall,
  } = useTwilioVoice();

  const open = callState === 'incoming' && !!incomingCall && !activeCall;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle>📞 Incoming Call</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm my-2">
          From: {incomingCall?.parameters?.From ?? 'Unknown'}
        </p>
        <DialogFooter className="flex justify-center gap-4">
          <Button variant="destructive" onClick={rejectIncoming}>
            Reject
          </Button>
          <Button onClick={acceptIncoming}>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
