import { TwilioClient } from '@/lib/twilio';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import cron from 'node-cron';

import { CallsRepository } from '@/db/repositories/calls';
import { ContactsRepository } from '@/db/repositories/contacts';
import { NumbersRepository } from '@/db/repositories/numbers';
import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import { ReassuranceCallJob, ReassuranceCallSchedule } from '@/types/db';
import { getNextRunAtForSchedule } from './getNextRunAtForSchedule';

const twilioClient = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const SERVER_DOMAIN = process.env.SERVER_DOMAIN!;

export async function createNextJobForSchedule(
  schedule: ReassuranceCallSchedule
): Promise<void> {
  const nextRunAt = await getNextRunAtForSchedule(schedule);
  console.log('[createNextJobForSchedule]', { scheduleId: schedule.id, nextRunAt });
  if (!nextRunAt) return;

  await ReassuranceCallJobsRepository.cancelAllPendingForSchedule(schedule.id);

  await ReassuranceCallJobsRepository.include({
    id: crypto.randomUUID(),
    schedule_id: schedule.id,
    run_at: nextRunAt,
    attempt: 1,
    status: 'pending',
  });
}

async function processJob(
  app: FastifyInstance,
  job: ReassuranceCallJob
): Promise<void> {
  const claimed = await ReassuranceCallJobsRepository.claimPending(job.id);
  if (!claimed) return;

  try {
    const schedule = await ReassuranceSchedulesRepository.find(job.schedule_id);

    if (!schedule) {
      await ReassuranceCallJobsRepository.markFailed(job.id, 'Schedule not found');
      return;
    }

    if (!schedule.is_active) {
      await ReassuranceCallJobsRepository.markFailed(job.id, 'Schedule inactive');
      return;
    }

    const numberEntry = await NumbersRepository.findById(schedule.number_id);

    if (!numberEntry) {
      await ReassuranceCallJobsRepository.markFailed(job.id, 'From number not found');
      return;
    }

    const twilioCall = await twilioClient.client.calls.create({
      from: numberEntry.number,
      to: schedule.phone_number,
      url: `${SERVER_DOMAIN}/twilio/reassurance/call?scheduleId=${schedule.id}&jobId=${job.id}`,
      statusCallback: `${SERVER_DOMAIN}/twilio/reassurance/status?jobId=${job.id}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed', 'busy', 'no-answer', 'failed'],
      record: 'record-from-answer-dual' as any,
      recordingStatusCallback: `${SERVER_DOMAIN}/twilio/voice/recording-status`,
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: ['completed'],
    });

    try {
      const contact = await ContactsRepository.findOrCreate({
        number: schedule.phone_number,
        companyId: schedule.company_id,
        label: schedule.name || schedule.phone_number || 'Unknown',
      });

      await CallsRepository.create({
        id: crypto.randomUUID(),
        number_id: schedule.number_id,
        contact_id: contact.id,
        initiated_at: new Date(),
        duration: undefined,
        meta: {
          jobId: job.id,
          scheduleId: schedule.id,
          from: numberEntry.number,
          to: schedule.phone_number,
          scheduleNickname: schedule.name,
        },
        call_sid: twilioCall.sid,
      });
    } catch (err: any) {
      app.log.error({ err, jobId: job.id }, 'Failed to log call to DB');
    }

    await ReassuranceCallJobsRepository.markCompleted(job.id);
    await createNextJobForSchedule(schedule);
  } catch (err: any) {
    app.log.error({ err, jobId: job.id }, 'Reassurance job failed');
    await ReassuranceCallJobsRepository.markFailed(
      job.id,
      err?.message || 'Unknown error'
    );
  }
}

async function recoverMissingJobs(app: FastifyInstance): Promise<void> {
  const schedules =
    await ReassuranceSchedulesRepository.findActiveWithNoJob();

  for (const schedule of schedules) {
    try {
      await createNextJobForSchedule(schedule);
    } catch (err: any) {
      app.log.error({ err, scheduleId: schedule.id }, 'Failed to recover job for schedule');
    }
  }
}

export async function registerReassuranceCron(app: FastifyInstance) {
  cron.schedule('* * * * *', async () => {
    try {
      await ReassuranceCallJobsRepository.resetStaleProcessing();
    } catch (err: any) {
      app.log.error({ err }, 'Failed to reset stale jobs');
    }

    try {
      await recoverMissingJobs(app);
    } catch (err: any) {
      app.log.error({ err }, 'Failed to recover missing jobs');
    }

    let jobs: ReassuranceCallJob[];

    try {
      jobs = await ReassuranceCallJobsRepository.findDue(50);
    } catch (err: any) {
      app.log.error({ err }, 'Failed to fetch due jobs');
      return;
    }

    for (const job of jobs) {
      try {
        await processJob(app, job);
      } catch (err: any) {
        app.log.error({ err, jobId: job.id }, 'Unexpected error processing job');
      }
    }
  });
}
