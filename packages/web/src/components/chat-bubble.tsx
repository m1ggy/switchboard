/* eslint-disable*/
import { formatDurationWithDateFns } from '@/lib/utils';
import { FileText, Phone, Printer, Voicemail } from 'lucide-react';
import { useState } from 'react';

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
    meta?: Record<string, string>;
    attachments?: Attachment[];
    pages?: number;
    faxStatus?: 'completed' | 'failed' | 'in-progress';
    mediaUrl?: string; // for faxes
    // 🆕 voicemails for calls
    callSid?: string;
    voicemails?: Voicemail[];
  };
  setFiles: (files: Attachment[]) => void;
  setIndex: (index: number) => void;
  setOpen: (open: boolean) => void;
  onPreviewFax?: (url: string) => void; // 🆕 new prop
};

function ChatBubble({
  item,
  setFiles,
  setIndex,
  setOpen,
  onPreviewFax,
}: ChatBubbleProps) {
  const isOutbound =
    item?.meta?.Direction === 'OUTGOING' || item.direction === 'outbound';
  const alignClass = isOutbound ? 'items-end' : 'items-start';
  const bubbleClass = isOutbound
    ? 'bg-[#61355A] text-white'
    : 'bg-gray-200 text-gray-900';

  const imageAttachments =
    item.attachments?.filter((a) => a.content_type?.startsWith('image/')) || [];
  const pdfAttachments =
    item.attachments?.filter((a) => a.content_type === 'application/pdf') || [];
  const previewImages = imageAttachments.slice(0, 3);
  const remainingCount = imageAttachments.length - 3;

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
    <div key={item.id} className={`flex flex-col gap-1 ${alignClass}`}>
      <div className={`max-w-xs px-4 py-3 rounded-2xl ${bubbleClass}`}>
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
            {item.message}
          </span>
        )}

        {/* Calls (incl. regular calls without voicemail) */}
        {item.type === 'call' && !item.voicemails?.length && (
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

        {/* 🆕 Calls with Voicemails */}
        {item.type === 'call' && item.voicemails?.length ? (
          <div className="flex flex-col gap-2">
            <span className="break-words whitespace-pre-wrap flex gap-1 items-center font-bold">
              <Voicemail className="w-4 h-4" /> Voicemail
              {item.voicemails.length > 1 && (
                <span className="text-sm font-normal">
                  — {item.voicemails.length} messages
                </span>
              )}
            </span>

            <div className="flex flex-col gap-3">
              {item.voicemails.map((vm) => (
                <div
                  key={vm.id}
                  className={`rounded-md p-2 ${
                    isOutbound ? 'bg-white/10' : 'bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <audio
                      className="w-full"
                      controls
                      preload="none"
                      src={vm.media_url}
                    />
                  </div>

                  <div className="mt-1 text-xs opacity-80 flex items-center justify-between">
                    <span>
                      {typeof vm.duration === 'number'
                        ? formatDurationWithDateFns(vm.duration || 0)
                        : '—'}
                    </span>
                    <span>
                      {new Date(vm.created_at).toLocaleString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        month: 'short',
                        day: '2-digit',
                      })}
                    </span>
                  </div>

                  {vm.transcription && (
                    <p className="mt-2 text-sm leading-snug">
                      {vm.transcription}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

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

            {/* PDF Preview Trigger */}
            {item.mediaUrl && (
              <div
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                  isOutbound
                    ? 'bg-white/10 hover:bg-white/20'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
                // @ts-ignore
                onClick={() => onPreviewFax?.(item.mediaUrl)}
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
                {item.message}
              </span>
            )}
          </div>
        )}
      </div>

      {/* existing timestamp for the bubble */}
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
