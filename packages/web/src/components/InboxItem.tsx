import { cn } from '@/lib/utils';
import type { InboxWithDetails } from 'api/types/db';
import { formatDistance } from 'date-fns';
import { Circle } from 'lucide-react';

interface InboxItemProps {
  inbox: InboxWithDetails;
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

  const isUnread =
    inbox.lastMessage &&
    new Date(inbox.lastMessage.created_at as string).toISOString() >
      new Date(inbox.lastViewedAt || 0).toISOString();

  return (
    <div
      className={cn(
        'flex flex-col gap-2 pt-2 py-1 px-2 cursor-pointer',
        isSelected && 'font-medium bg-accent',
        isUnread && 'bg-muted font-semibold'
      )}
      onClick={onSelect}
    >
      <div className="flex justify-between w-full items-center">
        <span className="font-medium">{inbox.contact.label}</span>
        {isUnread && <Circle fill="white" className="animate-pulse" size={8} />}
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
