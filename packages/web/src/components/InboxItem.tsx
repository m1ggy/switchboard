import { cn } from '@/lib/utils';
import { tz } from '@date-fns/tz';
import type { InboxWithDetails } from 'api/types/db';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';

interface InboxItemProps {
  inbox: InboxWithDetails & { unreadCount: number };
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Parse an ISO timestamp that represents UTC even if it lacks a Z/offset.
 * Example: "2025-09-24T05:05:04.19" -> treat as UTC by appending Z.
 */
function parseUtcIso(iso: string): Date {
  const trimmed = iso.trim();
  const hasZone = /Z|[+-]\d{2}:\d{2}$/.test(trimmed);
  return new Date(hasZone ? trimmed : `${trimmed}Z`);
}

export function InboxItem({ inbox, isSelected, onSelect }: InboxItemProps) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const inTZ = tz(timeZone);

  const lastMessageDate = inbox.lastMessage
    ? parseUtcIso(inbox.lastMessage.created_at as string)
    : null;

  const lastCallDate = inbox.lastCall
    ? parseUtcIso(inbox.lastCall.initiated_at as string)
    : null;

  let latestActivity: 'message' | 'call' | null = null;
  let latestDate: Date | null = null;

  if (
    lastMessageDate &&
    (!lastCallDate || lastMessageDate.getTime() > lastCallDate.getTime())
  ) {
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
          {formatDistanceToNow(latestDate, {
            addSuffix: true,
            // Key: compute the distance *in* the user's timezone
            in: inTZ,
          })}
        </span>
      )}
    </div>
  );
}
