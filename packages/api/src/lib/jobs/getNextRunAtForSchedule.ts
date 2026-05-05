// lib/reassurance/getNextRunAtForSchedule.ts

import { AppointmentReminderDetailsRepository } from '@/db/repositories/appointment_reminder_details';
import { ReassuranceCallSchedule } from '@/types/db';
import { DateTime } from 'luxon';

const SCHEDULE_TIMEZONE = 'America/Chicago';
const FAR_FUTURE_DAYS = 365;

/**
 * Computes next run time for both:
 * - recurring reassurance schedules
 * - appointment-based reminders
 */
export async function getNextRunAtForSchedule(
  schedule: ReassuranceCallSchedule
): Promise<Date> {
  const now = DateTime.now();

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
      // fallback to normal recurring logic
      return computeRecurringNextRun(schedule, now);
    }

    // Skip non-active appointment states
    if (
      detail.status === 'cancelled' ||
      detail.status === 'completed' ||
      detail.status === 'missed'
    ) {
      return farFutureDate(now);
    }

    /**
     * appointment_datetime is timestamptz from DB.
     * Convert it to a Luxon DateTime, subtract reminder offset,
     * and return the exact UTC instant as JS Date.
     */
    const appointmentDate = DateTime.fromJSDate(
      new Date(detail.appointment_datetime)
    );

    const runAt = appointmentDate.minus({
      minutes: detail.reminder_offset_minutes,
    });

    /**
     * If already past → do NOT re-run
     * important to avoid spamming missed reminders
     */
    if (runAt <= now) {
      return farFutureDate(now);
    }

    return runAt.toJSDate();
  }

  /**
   * ✅ DEFAULT RECURRING LOGIC
   */
  return computeRecurringNextRun(schedule, now);
}

function computeRecurringNextRun(
  schedule: ReassuranceCallSchedule,
  now: DateTime
): Date {
  const timezone = SCHEDULE_TIMEZONE;

  const nowInScheduleZone = now.setZone(timezone);

  const { hour, minute, second } = parseFrequencyTime(schedule.frequency_time);

  const allowedDays = normalizeAllowedDays(schedule.selected_days);

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = nowInScheduleZone.plus({ days: dayOffset }).set({
      hour,
      minute,
      second,
      millisecond: 0,
    });

    if (candidate <= nowInScheduleZone) continue;

    const candidateDayName = candidate?.weekdayLong?.toLowerCase() as string;

    if (allowedDays && !allowedDays.includes(candidateDayName)) {
      continue;
    }

    /**
     * This returns the same instant as a JS Date.
     * Postgres timestamptz will store the instant correctly.
     */
    return candidate.toJSDate();
  }

  /**
   * Fallback: should not reach here for valid schedules.
   * Uses tomorrow in Chicago at the scheduled time.
   */
  return nowInScheduleZone
    .plus({ days: 1 })
    .set({
      hour,
      minute,
      second,
      millisecond: 0,
    })
    .toJSDate();
}

function parseFrequencyTime(frequencyTime: string): {
  hour: number;
  minute: number;
  second: number;
} {
  const [hourStr, minuteStr = '0', secondStr = '0'] = frequencyTime.split(':');

  return {
    hour: parseInt(hourStr, 10) || 0,
    minute: parseInt(minuteStr, 10) || 0,
    second: parseInt(secondStr, 10) || 0,
  };
}

function normalizeAllowedDays(selectedDays?: string[] | string | null): string[] | null {
  if (!selectedDays) return null;

  // pg can return text[] as "{monday,tuesday}" instead of a JS array
  if (typeof selectedDays === 'string') {
    const days = selectedDays
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    return days.length ? days : null;
  }

  if (!Array.isArray(selectedDays) || selectedDays.length === 0) return null;

  return selectedDays.map((day) => day.toLowerCase());
}

function farFutureDate(now: DateTime): Date {
  return now.plus({ days: FAR_FUTURE_DAYS }).toJSDate();
}
