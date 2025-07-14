'use client';

import { formatDurationWithDateFns } from '@/lib/utils';
import { useState } from 'react';

type Attachment = {
  file_name: string;
  media_url: string;
  id: string;
  content_type: string;
};

type ChatBubbleProps = {
  item: {
    type: 'message' | 'call';
    id: string;
    numberId: string;
    createdAt: string;
    direction?: 'inbound' | 'outbound';
    message?: string;
    status?: 'sent' | 'draft';
    duration?: number;
    meta?: any;
    attachments?: Attachment[];
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

  const previewImages = imageAttachments.slice(0, 3);
  const remainingCount = imageAttachments.length - 3;

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const handleImageLoad = (id: string) => {
    setLoadingMap((prev) => ({ ...prev, [id]: false }));
  };

  const handleImageStart = (id: string) => {
    setLoadingMap((prev) => ({ ...prev, [id]: true }));
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
                {/* Spinner */}
                {loadingMap[img.id] !== false && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-10">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                <img
                  src={img.media_url}
                  alt={img.file_name}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    loadingMap[img.id] === false ? 'opacity-100' : 'opacity-0'
                  }`}
                  onLoad={() => handleImageLoad(img.id)}
                  onLoadStart={() => handleImageStart(img.id)}
                />

                {/* Overlay for more count */}
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
        ) : (
          <span className="break-words whitespace-pre-wrap">
            📞 Call —{' '}
            <strong>
              {formatDurationWithDateFns(item?.duration as number)}
            </strong>
          </span>
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
