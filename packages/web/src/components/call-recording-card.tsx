import { Download, Pause, Phone, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type CallRecording = {
  sid?: string | null;
  url?: string | null;
  duration?: number | null;
  channels?: string | null;
  source?: string | null;
  status?: string | null;
  callSid?: string | null;
  parentCallSid?: string | null;
};

function secondsToMMSS(value?: number | null) {
  const safe = Number.isFinite(value) && value && value >= 0 ? value : 0;
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.floor(safe % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

function getSafeDuration(
  audio: HTMLAudioElement | null,
  fallback?: number | null
) {
  const audioDuration = audio?.duration;
  if (typeof audioDuration === 'number' && Number.isFinite(audioDuration)) {
    return audioDuration;
  }

  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback;
  }

  return 0;
}

export default function CallRecordingCard({
  recording,
  createdAt,
  subtle,
}: {
  recording?: CallRecording | null;
  createdAt: string;
  subtle?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(
    Number.isFinite(recording?.duration) ? Number(recording?.duration) : 0
  );

  useEffect(() => {
    if (!recording) return;
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      setDuration(getSafeDuration(audio, recording.duration));
    };

    const onLoadedMetadata = () => {
      syncDuration();
    };

    const onCanPlay = () => {
      syncDuration();
    };

    const onDurationChange = () => {
      syncDuration();
    };

    const onTimeUpdate = () => {
      const nextTime =
        typeof audio.currentTime === 'number' &&
        Number.isFinite(audio.currentTime)
          ? audio.currentTime
          : 0;
      setElapsed(nextTime);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setElapsed(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    syncDuration();

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [recording, recording?.duration, recording?.url]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      console.error('Failed to toggle call recording playback', error);
    }
  };

  const progressMax = duration > 0 ? duration : 1;
  const progressValue = elapsed > progressMax ? progressMax : elapsed;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextValue = Number(e.target.value);
    if (!Number.isFinite(nextValue)) return;

    audio.currentTime = nextValue;
    setElapsed(nextValue);
  };

  const stamp = useMemo(
    () =>
      new Date(createdAt).toLocaleString([], {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: '2-digit',
      }),
    [createdAt]
  );

  const cardBg = subtle ? 'bg-white/10' : 'bg-gray-50';
  const ringColor = subtle ? 'ring-white/15' : 'ring-black/10';
  const muted = subtle ? 'text-white/75' : 'text-muted-foreground';
  const buttonBg = subtle
    ? 'bg-white/15 hover:bg-white/20'
    : 'bg-white hover:bg-gray-100';

  if (!recording?.url) return null;

  return (
    <div className={`mt-2 rounded-2xl p-3 ring-1 ${cardBg} ${ringColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10">
            <Phone className="h-4 w-4" />
          </span>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Call Recording</div>
            <div className={`text-xs ${muted}`}>
              {secondsToMMSS(duration)}
              {recording.status ? ` • ${recording.status}` : ''}
            </div>
          </div>
        </div>

        <a
          href={recording.url}
          download
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex shrink-0 items-center gap-1 text-xs ${muted} hover:opacity-80`}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${ringColor} ${buttonBg}`}
          aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={progressMax}
            step={0.1}
            value={progressValue}
            onChange={handleSeek}
            className="w-full"
            aria-label="Seek call recording"
          />
        </div>

        <div className={`shrink-0 text-right text-xs tabular-nums ${muted}`}>
          <div>{secondsToMMSS(elapsed)}</div>
          <div>{secondsToMMSS(duration)}</div>
        </div>
      </div>

      <div className={`mt-2 text-xs ${muted}`}>{stamp}</div>

      <audio ref={audioRef} preload="metadata" src={recording.url} />
    </div>
  );
}
