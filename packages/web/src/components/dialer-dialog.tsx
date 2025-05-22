import useMainStore from '@/lib/store';
import Dialer from './dialer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      </DialogContent>
    </Dialog>
  );
}

export default DialerDialog;
