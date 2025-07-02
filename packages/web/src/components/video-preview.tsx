import type { JitsiMeetJS } from '@/lib/jitsi';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';
import { Badge } from './ui/badge';

type VideoTrackPreviewProps = {
  track: JitsiMeetJS.JitsiTrack;
  label?: string;
  muted?: boolean;
  isSpeaking?: boolean;
  className?: string;
};

export function VideoTrackPreview({
  track,
  label,
  muted = false,
  isSpeaking = false,
  className,
}: VideoTrackPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!track || !videoRef.current) return;
    const el = videoRef.current;

    requestAnimationFrame(() => {
      try {
        track.attach(el);
        if (muted) el.muted = true;
      } catch (err) {
        console.error('[VideoTrackPreview] Failed to attach track:', err);
      }
    });

    return () => {
      try {
        track.detach(el);
      } catch (err) {
        console.warn('[VideoTrackPreview] Failed to detach track:', err);
      }
    };
  }, [track]);

  return (
    <div
      className={cn(
        'relative w-full transition-shadow duration-200',
        isSpeaking && 'ring-2 ring-green-500',
        className
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="aspect-video rounded-lg bg-black w-full"
      />
      {label && (
        <Badge
          variant="secondary"
          className="absolute bottom-2 left-2 text-xs px-2 py-0.5 pointer-events-none"
        >
          {label}
        </Badge>
      )}
    </div>
  );
}
