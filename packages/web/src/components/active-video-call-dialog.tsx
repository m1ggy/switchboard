import useMainStore from '@/lib/store';
import { useVideoCallStore } from '@/lib/stores/videocall';
import { NotebookPen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Textarea } from './ui/textarea';

function ActiveVideoCallDialog() {
  const { activeVideoCallDialogShown, setActiveVideoCallDialogShown } =
    useMainStore();

  const { videoStreams } = useVideoCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteRefs = useRef<HTMLVideoElement[]>([]);

  useEffect(() => {
    if (!videoStreams.local || !localVideoRef.current) return;

    requestAnimationFrame(() => {
      console.log('SETTING VIDEO FEED');
      const videoEl = localVideoRef.current!;
      videoEl.srcObject = videoStreams.local!;
      videoEl.muted = true; // important for autoplay
      videoEl.play().catch((err) => {
        console.error('[Video] local play() failed:', err);
      });
    });
  }, [videoStreams.local, localVideoRef.current]);

  useEffect(() => {
    videoStreams.remote?.forEach((stream, index) => {
      const el = remoteRefs.current[index];
      if (el && stream) {
        el.srcObject = stream;
        el.play().catch(console.error);
      }
    });
  }, [videoStreams.remote]);

  useEffect(() => {
    console.log('[video] Refs check:', {
      hasLocalRef: !!localVideoRef.current,
      hasLocalStream: !!videoStreams.local,
      tracks: videoStreams.local?.getTracks(),
    });
  }, [localVideoRef.current, videoStreams.local]);

  console.log({ videoStreams });

  return (
    <Dialog
      open={activeVideoCallDialogShown}
      onOpenChange={setActiveVideoCallDialogShown}
    >
      <DialogClose />
      <DialogContent className="[&>button:last-child]:hidden !w-[90vw] !max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge>🔴 LIVE</Badge> Miguel Buising (+9509881210)
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Video Panel */}
          <div className="flex-1 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
            {videoStreams.remote.map((_, i) => (
              <video
                key={i}
                ref={(el) => {
                  if (el) remoteRefs.current[i] = el;
                }}
                autoPlay
                playsInline
                className="w-full aspect-video rounded-lg bg-black"
              />
            ))}

            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full aspect-video rounded-lg bg-black"
            />
          </div>

          {/* Sidebar Panel */}
          <div className="w-full lg:w-[320px] flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-lg mb-2">Contact Info</h3>
              <p className="text-sm text-muted-foreground">
                Miguel Buising
                <br />
                (+9509881210)
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Notes</h3>
              <Textarea placeholder="Write notes here..." />
              <Button size="sm" className="mt-1 w-full">
                Add Note
              </Button>
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="flex justify-end gap-2 mt-6">
          <Button size="icon" variant="outline">
            <NotebookPen />
          </Button>
          <Button variant="destructive">END</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ActiveVideoCallDialog;
