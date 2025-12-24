// lib/reassurance/getNextRunAtForSchedule.ts
import { ReassuranceCallSchedule } from '@/types/db';

export function getNextRunAtForSchedule(
  schedule: ReassuranceCallSchedule
): Date {
  const now = new Date();

  // frequency_time is 'HH:MM' or 'HH:MM:SS' in UTC
  const [hourStr, minuteStr, secondStr] = schedule.frequency_time.split(':');
  const hour = parseInt(hourStr, 10) || 0;
  const minute = parseInt(minuteStr ?? '0', 10) || 0;
  const second = parseInt(secondStr ?? '0', 10) || 0;

  // Build "today at HH:MM:SS" in UTC
  let next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      second,
      0
    )
  );

  // If that time today (UTC) is already past, schedule for tomorrow (UTC)
  if (next <= now) {
    next = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        hour,
        minute,
        second,
        0
      )
    );
  }

  return next;
}
