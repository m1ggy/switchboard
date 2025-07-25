import { formatDurationWithDateFns } from '@/lib/utils';
import { FileText, Phone, Printer } from 'lucide-react';
import { useState } from 'react';

type Attachment = {
  file_name: string;
  media_url: string;
  id: string;
  content_type: string;
};

type ChatBubbleProps = {
  item: {
    type: 'message' | 'call' | 'fax';
    id: string;
    numberId: string;
    createdAt: string;
    direction?: 'inbound' | 'outbound';
    message?: string;
    status?: 'sent' | 'draft' | 'delivered' | 'failed' | string;
    duration?: number;
    meta?: Record<string, string>;
    attachments?: Attachment[];
    mediaUrl?: string; // NEW for faxes
    pages?: number;
  };
  setFiles: (files: Attachment[]) => void;
  setIndex: (index: number) => void;
  setOpen: (open: boolean) => void;
};

function ChatBubble({ item, setFiles, setIndex, setOpen }: ChatBubbleProps) {
  const isOutbound =
    item?.meta?.Direction === 'OUTGOING' || item.direction === 'outbound';
  const alignClass = isOutbound ? 'items-end' : 'items-start';
  const bubbleClass = isOutbound
    ? 'bg-[#61355A] text-white'
    : 'bg-gray-200 text-gray-900';

  const imageAttachments =
    item.attachments?.filter((a) => a?.content_type?.startsWith('image/')) ||
    [];
  const pdfAttachments =
    item.attachments?.filter((a) => a?.content_type === 'application/pdf') ||
    [];

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
      case 'delivered':
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'queued':
      case 'in-progress':
        return 'text-yellow-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getFaxStatusText = (status?: string) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return 'Delivered';
      case 'failed':
        return 'Failed';
      case 'queued':
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
                  //eslint-disable-next-line
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

        {item?.type === 'message' ? (
          <span className="break-words whitespace-pre-wrap">
            {item.message}
          </span>
        ) : item?.type === 'call' ? (
          <span className="break-words whitespace-pre-wrap flex gap-1 items-center font-bold">
            <Phone className="w-4 h-4" /> Call —{' '}
            {formatDurationWithDateFns(item?.duration as number)}
          </span>
        ) : item?.type === 'fax' ? (
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
                onClick={() => window.open(item.mediaUrl, '_blank')}
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Fax Document</p>
                  <p className="text-xs opacity-75">PDF</p>
                </div>
              </div>
            )}

            <span className={`text-xs ${getFaxStatusColor(item.status)}`}>
              {getFaxStatusText(item.status)}
            </span>

            {item.message && (
              <span className="text-sm mt-1 break-words whitespace-pre-wrap">
                {item.message}
              </span>
            )}
          </div>
        ) : null}
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
