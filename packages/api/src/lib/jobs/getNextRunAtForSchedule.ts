// lib/reassurance/getNextRunAtForSchedule.ts

import { AppointmentReminderDetailsRepository } from '@/db/repositories/appointment_reminder_details';
import { ReassuranceCallSchedule } from '@/types/db';
import { DateTime } from 'luxon';

const SCHEDULE_TIMEZONE = 'America/Chicago';

/**
 * Computes next run time for both:
 * - recurring reassurance schedules
 * - appointment-based reminders
 *
 * Returns null when the schedule should not create a job today.
 */
export async function getNextRunAtForSchedule(
  schedule: ReassuranceCallSchedule
): Promise<Date | null> {
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
      return computeRecurringNextRun(schedule, now);
    }

    if (
      detail.status === 'cancelled' ||
      detail.status === 'completed' ||
      detail.status === 'missed'
    ) {
      return null;
    }

    const appointmentDate = DateTime.fromJSDate(
      new Date(detail.appointment_datetime)
    );

    const runAt = appointmentDate.minus({
      minutes: detail.reminder_offset_minutes,
    });

    /**
     * If already past, skip.
     * Do not create a reminder job for a past appointment reminder.
     */
    if (runAt <= now) {
      return null;
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
): Date | null {
  const nowInScheduleZone = now.setZone(SCHEDULE_TIMEZONE);

  const { hour, minute, second } = parseFrequencyTime(schedule.frequency_time);

  const allowedDays = normalizeAllowedDays(schedule.selected_days);

  const candidate = nowInScheduleZone.set({
    hour,
    minute,
    second,
    millisecond: 0,
  });

  const candidateDayName = candidate.weekdayLong?.toLowerCase() as string;

  /**
   * If today is not an allowed day, skip.
   * Do not create tomorrow's job yet.
   */
  if (allowedDays && !allowedDays.includes(candidateDayName)) {
    return null;
  }

  /**
   * If today's scheduled time already passed, skip.
   * Do not create tomorrow's job yet.
   */
  if (candidate <= nowInScheduleZone) {
    return null;
  }

  return candidate.toJSDate();
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

function normalizeAllowedDays(selectedDays?: string[] | null): string[] | null {
  if (!selectedDays || selectedDays.length === 0) {
    return null;
  }

  return selectedDays.map((day) => day.toLowerCase());
}
