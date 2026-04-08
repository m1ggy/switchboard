/* eslint-disable*/
import { formatDurationWithDateFns } from '@/lib/utils';
import {
  Download,
  FileText,
  Pause,
  Phone,
  Play,
  Printer,
  Voicemail as VoicemailIcon,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

type Attachment = {
  file_name: string;
  media_url: string;
  id: string;
  content_type: string;
};

type Voicemail = {
  id: string;
  media_url: string;
  transcription?: string | null;
  duration?: number | null;
  created_at: string;
};

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

type UIReaction = {
  emoji: string;
  from?: string;
};

type ChatBubbleProps = {
  item: {
    type: 'message' | 'call' | 'fax';
    id: string;
    numberId: string;
    createdAt: string;
    direction?: 'inbound' | 'outbound';
    message?: string;
    status?: 'sent' | 'draft' | 'delivered' | 'failed';
    duration?: number;
    meta?: Record<string, any>;
    attachments?: Attachment[];
    pages?: number;
    faxStatus?: 'completed' | 'failed' | 'in-progress';
    mediaUrl?: string;
    callSid?: string;
    voicemails?: Voicemail[];
  };
  setFiles: (files: Attachment[]) => void;
  setIndex: (index: number) => void;
  setOpen: (open: boolean) => void;
  onPreviewFax?: (url: string) => void;
  reactions?: UIReaction[];
};

function secondsToMMSS(s: number) {
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

function renderTextWithLinks(text?: string) {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

  return text.split(urlRegex).map((part, index) => {
    if (!part) return null;

    const isUrl = /^(https?:\/\/|www\.)/i.test(part);

    if (!isUrl) {
      return <Fragment key={`text-${index}`}>{part}</Fragment>;
    }

    const cleaned = part.replace(/[.,!?)]*$/, '');

    return (
      <Fragment key={`link-${index}`}>
        <a
          href={cleaned.startsWith('http') ? cleaned : `https://${cleaned}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 break-all hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {cleaned}
        </a>
        {part.slice(cleaned.length)}
      </Fragment>
    );
  });
}

function AudioCard({
  url,
  title,
  createdAt,
  durationSeconds,
  transcription,
  subtle,
  icon,
}: {
  url: string;
  title: string;
  createdAt: string;
  durationSeconds?: number | null;
  transcription?: string | null;
  subtle?: boolean;
  icon?: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const initialDuration = durationSeconds ?? 0;
  const [duration, setDuration] = useState<number>(initialDuration);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => {
      setElapsed(a.currentTime);
      const d = a.duration || duration || initialDuration || 1;
      setProgress(a.currentTime / d);
    };

    const onLoaded = () => {
      setDuration(a.duration || duration || initialDuration);
    };

    const onEnd = () => {
      setIsPlaying(false);
      setProgress(0);
      setElapsed(0);
    };

    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('ended', onEnd);
    a.addEventListener('pause', onPause);
    a.addEventListener('play', onPlay);

    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('play', onPlay);
    };
  }, [duration, initialDuration]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;

    if (isPlaying) {
      a.pause();
      return;
    }

    try {
      await a.play();
    } catch (err) {
      console.error('Failed to play audio', err);
    }
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;

    const pct = Number(e.target.value);
    const d = a.duration || duration || initialDuration || 1;
    a.currentTime = (pct / 100) * d;
    setProgress(pct / 100);
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
  const ringColor = subtle ? 'ring-white/20' : 'ring-black/5';
  const textMuted = subtle ? 'text-white/70' : 'text-gray-500';
  const buttonBg = subtle
    ? 'bg-white/90 hover:bg-white'
    : 'bg-white/70 hover:bg-white';

  return (
    <div className={`rounded-xl p-3 ${cardBg} ring-1 ${ringColor}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/10 shrink-0">
            {icon ?? <Phone className="w-3.5 h-3.5" />}
          </span>
          <span className="font-semibold truncate">{title}</span>
          <span
            className={`ml-1 px-1.5 py-0.5 text-[11px] rounded bg-black/10 ${textMuted} shrink-0`}
            title="Duration"
          >
            {secondsToMMSS(duration || initialDuration || 0)}
          </span>
        </div>

        <a
          href={url}
          download
          className={`inline-flex items-center gap-1 text-xs ${textMuted} hover:opacity-80 shrink-0`}
          title="Download"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={`h-9 w-9 rounded-full flex items-center justify-center ring-1 ${ringColor} ${buttonBg} transition shrink-0`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          type="button"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(progress * 100)}
          onChange={onSeek}
          className="flex-1 accent-current"
          aria-label="Seek"
        />

        <div className={`w-20 text-right text-xs tabular-nums ${textMuted}`}>
          {secondsToMMSS(elapsed)} /{' '}
          {secondsToMMSS(duration || initialDuration || 0)}
        </div>

        <audio ref={audioRef} preload="none" src={url} />
      </div>

      <div className={`mt-2 text-xs ${textMuted}`}>{stamp}</div>

      {transcription && (
        <p className="mt-2 text-sm leading-snug">{transcription}</p>
      )}
    </div>
  );
}

function VoicemailCard({ vm, subtle }: { vm: Voicemail; subtle?: boolean }) {
  return (
    <AudioCard
      url={vm.media_url}
      title="Voicemail"
      createdAt={vm.created_at}
      durationSeconds={vm.duration}
      transcription={vm.transcription}
      subtle={subtle}
      icon={<VoicemailIcon className="w-3.5 h-3.5" />}
    />
  );
}

function CallRecordingCard({
  recording,
  createdAt,
  subtle,
}: {
  recording: CallRecording;
  createdAt: string;
  subtle?: boolean;
}) {
  if (!recording?.url) return null;

  return (
    <AudioCard
      url={recording.url}
      title="Call Recording"
      createdAt={createdAt}
      durationSeconds={recording.duration}
      subtle={subtle}
      icon={<Phone className="w-3.5 h-3.5" />}
    />
  );
}

function ChatBubble({
  item,
  setFiles,
  setIndex,
  setOpen,
  onPreviewFax,
  reactions,
}: ChatBubbleProps) {
  const isOutbound =
    item?.meta?.Direction === 'OUTGOING' || item.direction === 'outbound';
  const alignClass = isOutbound ? 'items-end' : 'items-start';
  const bubbleClass = isOutbound
    ? 'bg-[#61355A] text-white'
    : 'bg-gray-200 text-gray-900';

  const hasReactions = item.type === 'message' && (reactions?.length ?? 0) > 0;
  const reactionDock = isOutbound ? 'right-3' : 'left-3';

  const imageAttachments =
    item.attachments?.filter((a) => a.content_type?.startsWith('image/')) || [];
  const previewImages = imageAttachments.slice(0, 3);
  const remainingCount = imageAttachments.length - 3;

  const recording = (item.meta?.recording ?? null) as CallRecording | null;
  const hasCallRecording = Boolean(recording?.url);

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const handleImageLoad = (id: string) => {
    setLoadingMap((prev) => ({ ...prev, [id]: false }));
  };

  const handleImageStart = (id: string) => {
    setLoadingMap((prev) => ({ ...prev, [id]: true }));
  };

  const getFaxStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'in-progress':
        return 'text-yellow-400';
      default:
        return '';
    }
  };

  const getFaxStatusText = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'Delivered';
      case 'failed':
        return 'Failed';
      case 'in-progress':
        return 'Sending';
      default:
        return 'Sent';
    }
  };

  return (
    <div
      key={item.id}
      className={`flex flex-col ${alignClass} ${hasReactions ? 'gap-3' : 'gap-1'}`}
    >
      <div
        className={`relative max-w-xs px-4 py-3 rounded-2xl ${bubbleClass} ${
          hasReactions ? 'pb-5' : ''
        }`}
      >
        {previewImages.length > 0 && (
          <div className="flex gap-2 mt-1 mb-2">
            {previewImages.map((img, index) => (
              <div
                key={img.id}
                className="relative w-24 h-24 overflow-hidden rounded-md cursor-pointer"
                onClick={() => {
                  setFiles(imageAttachments);
                  setIndex(index);
                  setOpen(true);
                }}
              >
                {loadingMap[img.id] !== false && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-10">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <img
                  src={img.media_url || '/placeholder.svg'}
                  alt={img.file_name}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    loadingMap[img.id] === false ? 'opacity-100' : 'opacity-0'
                  }`}
                  onLoad={() => handleImageLoad(img.id)}
                  onLoadStart={() => handleImageStart(img.id)}
                />
                {index === 2 && remainingCount > 0 && (
                  <div className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-xs font-semibold z-20">
                    +{remainingCount} more
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {item.type === 'message' && (
          <span className="break-words whitespace-pre-wrap">
            {renderTextWithLinks(item.message)}
          </span>
        )}

        {hasReactions ? (
          <div
            className={`absolute -bottom-3 ${reactionDock} flex items-center gap-1 px-2 py-1 rounded-full shadow-sm ring-1 ${
              isOutbound
                ? 'bg-[#4f2a49] ring-white/15'
                : 'bg-white ring-black/10'
            }`}
          >
            {reactions!.slice(0, 6).map((r, idx) => (
              <span
                key={`${r.emoji}-${r.from ?? ''}-${idx}`}
                className="text-sm leading-none"
                title={r.from ? `Reaction from ${r.from}` : 'Reaction'}
              >
                {r.emoji}
              </span>
            ))}

            {reactions!.length > 6 ? (
              <span
                className={`text-[10px] ${
                  isOutbound ? 'text-white/80' : 'text-gray-600'
                }`}
              >
                +{reactions!.length - 6}
              </span>
            ) : null}
          </div>
        ) : null}

        {item.type === 'call' && item.voicemails?.length ? (
          <div className="flex flex-col gap-3">
            {item.voicemails.map((vm) => (
              <VoicemailCard key={vm.id} vm={vm} subtle={isOutbound} />
            ))}
          </div>
        ) : null}

        {item.type === 'call' &&
        !item.voicemails?.length &&
        hasCallRecording ? (
          <div className="flex flex-col gap-2">
            <span className="break-words whitespace-pre-wrap flex gap-1 items-center font-bold">
              <Phone className="w-4 h-4" />
              Call
              {typeof item.duration === 'number' && (
                <span className="font-normal">
                  — {formatDurationWithDateFns(item.duration ?? 0)}
                </span>
              )}
              {item.meta?.status && (
                <span className="text-xs font-normal opacity-75 ml-2">
                  ({item.meta.status})
                </span>
              )}
            </span>

            <CallRecordingCard
              recording={recording as CallRecording}
              createdAt={item.createdAt}
              subtle={isOutbound}
            />
          </div>
        ) : null}

        {item.type === 'call' &&
          !item.voicemails?.length &&
          !hasCallRecording && (
            <span className="break-words whitespace-pre-wrap flex gap-1 items-center font-bold">
              <Phone className="w-4 h-4" /> Call{' '}
              {typeof item.duration === 'number' && (
                <>— {formatDurationWithDateFns(item.duration ?? 0)}</>
              )}
              {item.meta?.status && (
                <span className="text-xs font-normal opacity-75 ml-2">
                  ({item.meta.status})
                </span>
              )}
            </span>
          )}

        {item.type === 'fax' && (
          <div className="flex flex-col gap-2">
            <span className="break-words whitespace-pre-wrap flex gap-1 items-center font-bold">
              <Printer className="w-4 h-4" /> Fax
              {item.pages && (
                <span className="text-sm font-normal">
                  — {item.pages} page{item.pages !== 1 ? 's' : ''}
                </span>
              )}
            </span>

            {item.mediaUrl && (
              <div
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                  isOutbound
                    ? 'bg-white/10 hover:bg-white/20'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
                onClick={() => onPreviewFax?.(item.mediaUrl!)}
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Fax Document</p>
                  <p className="text-xs opacity-75">Click to preview PDF</p>
                </div>
              </div>
            )}

            {item.faxStatus && (
              <span className={`text-xs ${getFaxStatusColor(item.faxStatus)}`}>
                {getFaxStatusText(item.faxStatus)}
              </span>
            )}

            {item.message && (
              <span className="text-sm mt-1 break-words whitespace-pre-wrap">
                {renderTextWithLinks(item.message)}
              </span>
            )}
          </div>
        )}
      </div>

      <span className="text-[10px] text-muted-foreground mt-1">
        {new Date(item.createdAt).toLocaleTimeString([], {
          minute: '2-digit',
          hour12: true,
          hour: '2-digit',
        })}
      </span>
    </div>
  );
}

export default ChatBubble;
