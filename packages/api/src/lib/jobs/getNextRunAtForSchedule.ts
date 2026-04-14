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

/**
 * Existing logic extracted (cleaner)
 */
function computeRecurringNextRun(
  schedule: ReassuranceCallSchedule,
  now: Date
): Date {
  const [hourStr, minuteStr, secondStr] = schedule.frequency_time.split(':');

  const hour = parseInt(hourStr, 10) || 0;
  const minute = parseInt(minuteStr ?? '0', 10) || 0;
  const second = parseInt(secondStr ?? '0', 10) || 0;

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
