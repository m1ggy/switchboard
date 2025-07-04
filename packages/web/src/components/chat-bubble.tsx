import { formatDurationWithDateFns } from '@/lib/utils';

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
  };
};

function ChatBubble({ item }: ChatBubbleProps) {
  const isOutbound =
    item?.meta?.Direction === 'OUTGOING' || item.direction === 'outbound';
  const alignClass = isOutbound ? 'items-end' : 'items-start';
  const bubbleClass = isOutbound
    ? 'bg-[#61355A] text-white'
    : 'bg-gray-200 text-gray-900';

  return (
    <div key={item.id} className={`flex flex-col ${alignClass}`}>
      <div className={`max-w-xs px-4 py-3 rounded-2xl ${bubbleClass}`}>
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
          second: undefined,
          hour12: true,
          hour: '2-digit',
        })}
      </span>
    </div>
  );
}

export default ChatBubble;
