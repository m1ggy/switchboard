// jobs/reassuranceCron.ts
import { CallsRepository } from '@/db/repositories/calls';
import { ContactsRepository } from '@/db/repositories/contacts';
import { NumbersRepository } from '@/db/repositories/numbers';
import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import { TwilioClient } from '@/lib/twilio';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import cron from 'node-cron';
import { getNextRunAtForSchedule } from './getNextRunAtForSchedule';

const twilioClient = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);
const SERVER_DOMAIN = process.env.SERVER_DOMAIN!;

/**
 * Ensures there is exactly one active (pending/processing) job per schedule,
 * and that its run_at matches the currently computed nextRunAt.
 *
 * - If none exists -> create pending job at nextRunAt
 * - If one exists and is pending but run_at differs -> reschedule it to nextRunAt
 * - If one exists and is processing -> leave it alone (avoid moving an in-flight job)
 *
 * This prevents "stale pending jobs" from old schedule times causing unexpected runs.
 */
async function ensureNextJobForSchedule(
  app: FastifyInstance,
  scheduleId: number,
  nextRunAt: Date
) {
  const existing =
    await ReassuranceCallJobsRepository.findActiveForSchedule(scheduleId);

  // No active job => create one
  if (!existing) {
    await ReassuranceCallJobsRepository.include({
      id: crypto.randomUUID(),
      schedule_id: scheduleId,
      run_at: nextRunAt,
      attempt: 1,
      status: 'pending',
    });

    app.log.info(
      { scheduleId, nextRunAt },
      'Seeded upcoming reassurance job (created new)'
    );
    return;
  }

  const existingRunAt = new Date(existing.run_at as any);
  const diffMs = Math.abs(existingRunAt.getTime() - nextRunAt.getTime());

  // If it's already effectively the same time, do nothing
  if (diffMs < 1000) {
    app.log.debug(
      { scheduleId, existingJobId: existing.id, runAt: existingRunAt },
      'Upcoming reassurance job already matches nextRunAt'
    );
    return;
  }

  // If it's pending, we can safely reschedule to the correct nextRunAt
  if (existing.status === 'pending') {
    await ReassuranceCallJobsRepository.reschedule(existing.id, {
      run_at: nextRunAt,
    });

    app.log.info(
      {
        scheduleId,
        jobId: existing.id,
        fromRunAt: existingRunAt,
        toRunAt: nextRunAt,
      },
      'Rescheduled existing pending reassurance job to match nextRunAt'
    );
    return;
  }

  // If processing, leave it as-is (in-flight); cron will seed again next minute
  app.log.warn(
    {
      scheduleId,
      jobId: existing.id,
      status: existing.status,
      existingRunAt,
      desiredNextRunAt: nextRunAt,
    },
    'Active reassurance job is in-flight; not rescheduling'
  );
}

async function seedUpcomingJobs(app: FastifyInstance) {
  // Batch through active schedules and ensure each has an upcoming job
  const limit = 500;
  let offset = 0;

  while (true) {
    const schedules = await ReassuranceSchedulesRepository.findActive({
      limit,
      offset,
    });

    if (!schedules.length) break;

    for (const schedule of schedules) {
      try {
        if (!schedule.is_active) continue;

        const nextRunAt = getNextRunAtForSchedule(schedule);

        // FIX: enforce one active job per schedule; reschedule stale pending jobs
        await ensureNextJobForSchedule(app, schedule.id, nextRunAt);
      } catch (err: any) {
        app.log.error(
          { err, scheduleId: schedule.id },
          'Failed seeding/upserting upcoming reassurance job'
        );
      }
    }

    offset += schedules.length;
    if (schedules.length < limit) break;
  }
}

export async function registerReassuranceCron(app: FastifyInstance) {
  cron.schedule('* * * * *', async () => {
    const startTime = Date.now();
    app.log.info('Reassurance cron started');

    // 0) Ensure upcoming jobs exist for active schedules
    try {
      await seedUpcomingJobs(app);
    } catch (err: any) {
      app.log.error({ err }, 'Failed to seed upcoming reassurance jobs');
      // continue anyway; due-job processing can still run
    }

    let jobs: any[] = [];

    try {
      jobs = await ReassuranceCallJobsRepository.findDue(50);
      app.log.info(
        { jobCount: jobs.length },
        'Reassurance cron fetched due jobs'
      );

      if (!jobs.length) {
        app.log.info('Reassurance cron found no pending jobs');
        return;
      }
    } catch (err: any) {
      app.log.error({ err }, 'Failed to fetch reassurance jobs');
      return;
    }

    for (const job of jobs) {
      app.log.info(
        { jobId: job.id, scheduleId: job.schedule_id },
        'Processing reassurance job'
      );

      try {
        // FIX: atomically claim the job to avoid double-processing across workers
        const claimed = await ReassuranceCallJobsRepository.claimPending(
          job.id
        );
        if (!claimed) {
          app.log.debug(
            { jobId: job.id },
            'Skipped job; already claimed by another worker'
          );
          continue;
        }

        app.log.debug(
          { jobId: job.id },
          'Claimed reassurance job (marked processing)'
        );

        const schedule = await ReassuranceSchedulesRepository.find(
          job.schedule_id
        );

        if (!schedule) {
          app.log.warn(
            { jobId: job.id, scheduleId: job.schedule_id },
            'Schedule not found'
          );

          await ReassuranceCallJobsRepository.markFailed(
            job.id,
            'Schedule not found'
          );
          continue;
        }

        if (!schedule.is_active) {
          app.log.warn(
            { jobId: job.id, scheduleId: job.schedule_id },
            'Schedule is inactive'
          );

          await ReassuranceCallJobsRepository.markFailed(
            job.id,
            'Schedule inactive'
          );
          continue;
        }

        // Resolve the from-number from schedule.number_id
        let fromNumber: string;

        try {
          app.log.debug(
            {
              jobId: job.id,
              scheduleId: schedule.id,
              numberId: schedule.number_id,
            },
            'Resolving from-number for reassurance call'
          );

          const numberEntry = await NumbersRepository.findById(
            schedule.number_id
          );

          if (!numberEntry) {
            app.log.error(
              {
                jobId: job.id,
                scheduleId: schedule.id,
                numberId: schedule.number_id,
              },
              'Number not found for schedule.number_id'
            );

            await ReassuranceCallJobsRepository.markFailed(
              job.id,
              'From number not found'
            );
            continue;
          }

          fromNumber = numberEntry.number;

          // Optional: sanity check that company_id matches
          if (numberEntry.company_id !== schedule.company_id) {
            app.log.warn(
              {
                jobId: job.id,
                scheduleId: schedule.id,
                scheduleCompanyId: schedule.company_id,
                numberCompanyId: numberEntry.company_id,
                numberId: schedule.number_id,
              },
              'schedule.company_id does not match number.company_id'
            );
          }

          app.log.info(
            {
              jobId: job.id,
              scheduleId: schedule.id,
              fromNumber,
              numberId: schedule.number_id,
              companyId: schedule.company_id,
            },
            'Resolved from-number for reassurance call'
          );
        } catch (err: any) {
          app.log.error(
            {
              err,
              jobId: job.id,
              scheduleId: schedule.id,
              numberId: schedule.number_id,
            },
            'Failed to resolve from-number for reassurance call'
          );

          await ReassuranceCallJobsRepository.markFailed(
            job.id,
            'Failed to resolve from number'
          );
          continue;
        }

        app.log.info(
          {
            jobId: job.id,
            scheduleId: schedule.id,
            phoneNumber: schedule.phone_number,
            fromNumber,
          },
          'Initiating Twilio call'
        );

        const twilioCall = await twilioClient.client.calls.create({
          from: fromNumber,
          to: schedule.phone_number,
          url: `${SERVER_DOMAIN}/twilio/reassurance/call?scheduleId=${schedule.id}&jobId=${job.id}`,
          statusCallback: `${SERVER_DOMAIN}/twilio/reassurance/status?jobId=${job.id}`,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['completed', 'busy', 'no-answer', 'failed'],
        });

        app.log.info(
          {
            jobId: job.id,
            scheduleId: schedule.id,
            phoneNumber: schedule.phone_number,
            fromNumber,
            callSid: twilioCall.sid,
          },
          'Twilio call successfully triggered'
        );

        // --- Contact resolution & call logging ------------------------
        try {
          const contactLabel =
            schedule.name || schedule.phone_number || 'Unknown';

          app.log.info(
            {
              jobId: job.id,
              scheduleId: schedule.id,
              companyId: schedule.company_id,
              number: schedule.phone_number,
              label: contactLabel,
            },
            'Resolving contact for reassurance call'
          );

          const contact = await ContactsRepository.findOrCreate({
            number: schedule.phone_number,
            companyId: schedule.company_id,
            label: contactLabel,
          });

          app.log.info(
            {
              jobId: job.id,
              contactId: contact.id,
              companyId: schedule.company_id,
            },
            'Contact resolved/created for reassurance call'
          );

          const callId = crypto.randomUUID();

          const callMeta = {
            jobId: job.id,
            scheduleId: schedule.id,
            from: fromNumber,
            to: schedule.phone_number,
            scheduleNickname: schedule.name,
          };

          await CallsRepository.create({
            id: callId,
            number_id: schedule.number_id,
            contact_id: contact.id,
            initiated_at: new Date(),
            duration: undefined,
            meta: callMeta,
            call_sid: twilioCall.sid,
          });

          app.log.info(
            {
              jobId: job.id,
              callId,
              callSid: twilioCall.sid,
              contactId: contact.id,
              numberId: schedule.number_id,
              companyId: schedule.company_id,
            },
            'Reassurance call logged to database'
          );
        } catch (err: any) {
          // We don't want to fail the job if logging fails, just report it.
          app.log.error(
            {
              err,
              jobId: job.id,
              scheduleId: schedule.id,
              phoneNumber: schedule.phone_number,
              numberId: schedule.number_id,
              companyId: schedule.company_id,
            },
            'Failed to log reassurance call to database'
          );
        }
        // -------------------------------------------------------------

        // Mark job completed (call has been successfully triggered)
        await ReassuranceCallJobsRepository.markCompleted(job.id);

        // Seed the next run for this schedule:
        // FIX: enforce one active job per schedule; reschedule stale pending jobs
        try {
          const nextRunAt = getNextRunAtForSchedule(schedule);
          await ensureNextJobForSchedule(app, schedule.id, nextRunAt);

          app.log.info(
            { scheduleId: schedule.id, nextRunAt, completedJobId: job.id },
            'Ensured next reassurance job after completion'
          );
        } catch (err: any) {
          // Don't fail the completed job if seeding next run fails; cron will retry next minute
          app.log.error(
            { err, scheduleId: schedule.id, completedJobId: job.id },
            'Failed to ensure next reassurance job after completion'
          );
        }
      } catch (err: any) {
        app.log.error(
          { err, jobId: job.id, scheduleId: job.schedule_id },
          'Reassurance job failed to start call'
        );

        await ReassuranceCallJobsRepository.markFailed(
          job.id,
          err?.message || 'Failed to start call'
        );
      }
    }

    app.log.info(
      { durationMs: Date.now() - startTime },
      'Reassurance cron finished'
    );
  });
}
