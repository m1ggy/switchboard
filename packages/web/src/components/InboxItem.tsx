import { cn } from '@/lib/utils';
import type { InboxWithDetails } from 'api/types/db';
import { formatDistance } from 'date-fns';
import { Badge } from './ui/badge';

interface InboxItemProps {
  inbox: InboxWithDetails & { unreadCount: number };
  isSelected: boolean;
  onSelect: () => void;
}

export function InboxItem({ inbox, isSelected, onSelect }: InboxItemProps) {
  const lastMessageDate = inbox.lastMessage
    ? new Date(inbox.lastMessage.created_at as string)
    : null;

  const lastCallDate = inbox.lastCall
    ? new Date(inbox.lastCall.initiated_at as string)
    : null;

  let latestActivity: 'message' | 'call' | null = null;
  let latestDate: Date | null = null;

  if (lastMessageDate && (!lastCallDate || lastMessageDate > lastCallDate)) {
    latestActivity = 'message';
    latestDate = lastMessageDate;
  } else if (lastCallDate) {
    latestActivity = 'call';
    latestDate = lastCallDate;
  }

  const isUnread = inbox.unreadCount > 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 pt-2 py-4 px-4 cursor-pointer rounded-md mt-1 mx-2',
        isSelected && 'font-medium bg-accent',
        isUnread && 'bg-muted font-semibold'
      )}
      onClick={onSelect}
    >
      <div className="flex justify-between w-full items-center">
        <span className="font-medium">{inbox.contact.label}</span>
        {isUnread && <Badge>{inbox.unreadCount}</Badge>}
      </div>

      {latestActivity === 'call' && (
        <span className="text-sm text-muted-foreground">Call Ended</span>
      )}

      {latestActivity === 'message' && inbox.lastMessage && (
        <span className="text-sm text-muted-foreground truncate overflow-hidden whitespace-nowrap max-w-48">
          {inbox.lastMessage.message}
        </span>
      )}

      {latestDate && (
        <span className="text-xs text-muted-foreground text-right">
          {formatDistance(latestDate, new Date(), { addSuffix: true })}
        </span>
      )}
    </div>
  );
}
