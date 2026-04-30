// lib/reassurance/getNextRunAtForSchedule.ts

import { AppointmentReminderDetailsRepository } from '@/db/repositories/appointment_reminder_details';
import { ReassuranceCallSchedule } from '@/types/db';

/**
 * Computes next run time for both:
 * - recurring reassurance schedules
 * - appointment-based reminders
 */
export async function getNextRunAtForSchedule(
  schedule: ReassuranceCallSchedule
): Promise<Date> {
  const now = new Date();

  /**
   * ✅ APPOINTMENT-BASED REMINDER
   */
  if (
    schedule.script_type === 'template' &&
    schedule.template === 'appointment'
  ) {
    const detail = await AppointmentReminderDetailsRepository.findByScheduleId(
      schedule.id
    );

    if (!detail) {
      // fallback to normal logic (failsafe)
      return computeRecurringNextRun(schedule, now);
    }

    // Skip non-active appointment states
    if (
      detail.status === 'cancelled' ||
      detail.status === 'completed' ||
      detail.status === 'missed'
    ) {
      // Return a far future date so it doesn't run again
      return new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    }

    const appointmentDate = new Date(detail.appointment_datetime);

    const runAt = new Date(
      appointmentDate.getTime() - detail.reminder_offset_minutes * 60 * 1000
    );

    /**
     * If already past → do NOT re-run
     * (important to avoid spamming missed reminders)
     */
    if (runAt <= now) {
      return new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    }

    return runAt;
  }

  /**
   * ✅ DEFAULT RECURRING LOGIC
   */
  return computeRecurringNextRun(schedule, now);
}

const SCHEDULE_TIMEZONE = 'America/Chicago';

function computeRecurringNextRun(
  schedule: ReassuranceCallSchedule,
  now: Date
): Date {
  const [hourStr, minuteStr, secondStr] = schedule.frequency_time.split(':');
  const hour = parseInt(hourStr, 10) || 0;
  const minute = parseInt(minuteStr ?? '0', 10) || 0;
  const second = parseInt(secondStr ?? '0', 10) || 0;

  let next = chicagoLocalToUTC(now, 0, hour, minute, second);
  if (next <= now) {
    next = chicagoLocalToUTC(now, 1, hour, minute, second);
  }
  return next;
}

// Returns UTC ms offset for a timezone at a given UTC moment: UTC - localAsUTC
function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value);
  const localAsUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return date.getTime() - localAsUTC;
}

// Converts a Chicago local H:M:S on a given base date (+dayOffset days) to UTC
function chicagoLocalToUTC(
  base: Date,
  dayOffset: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = fmt.formatToParts(base);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value);
  const year = get('year');
  const month = get('month') - 1;
  const day = get('day') + dayOffset;

  // Treat Chicago local time as UTC to get a probe timestamp
  const probe = new Date(Date.UTC(year, month, day, hour, minute, second));

  // Correct for actual Chicago UTC offset at the probe moment
  const offsetMs = getTimezoneOffsetMs(probe, SCHEDULE_TIMEZONE);
  return new Date(probe.getTime() + offsetMs);
}
