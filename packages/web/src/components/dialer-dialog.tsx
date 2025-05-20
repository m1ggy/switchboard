import useMainStore from '@/lib/store';
import Dialer from './dialer';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

function DialerDialog() {
  const { dialerModalShown, setDialerModalShown } = useMainStore();
  return (
    <Dialog open={dialerModalShown} onOpenChange={setDialerModalShown}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialer</DialogTitle>
          <DialogDescription>Initiate a call</DialogDescription>
        </DialogHeader>
        <Dialer />
        <DialogFooter>
          <Button>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DialerDialog;
