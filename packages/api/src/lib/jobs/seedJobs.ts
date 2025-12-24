import { ReassuranceCallJobsRepository } from '@/db/repositories/reassurance_calls_jobs';
import { ReassuranceSchedulesRepository } from '@/db/repositories/reassurance_schedules';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { getNextRunAtForSchedule } from './getNextRunAtForSchedule';

export async function seedUpcomingJobs(app: FastifyInstance) {
  const now = new Date();

  // You can page this if you have many schedules
  const schedules = await ReassuranceSchedulesRepository.findActive({
    limit: 500,
    offset: 0,
  });

  for (const schedule of schedules) {
    try {
      const nextRunAt = getNextRunAtForSchedule(schedule);

      // Optional: only seed if it's "soon" (prevents creating far-future jobs)
      // Example window: next 24h
      const within24h =
        nextRunAt.getTime() <= now.getTime() + 24 * 60 * 60 * 1000;
      if (!within24h) continue;

      // Check if there is already a run in place
      const exists = await ReassuranceCallJobsRepository.existsPendingAtRunAt(
        schedule.id,
        nextRunAt
      );

      if (exists) continue;

      // Create the run
      await ReassuranceCallJobsRepository.include({
        id: crypto.randomUUID(),
        schedule_id: schedule.id,
        run_at: nextRunAt,
        attempt: 1,
        status: 'pending',
      });

      app.log.info(
        { scheduleId: schedule.id, nextRunAt },
        'Seeded upcoming reassurance job'
      );
    } catch (err: any) {
      app.log.error({ err, scheduleId: schedule.id }, 'Failed seeding job');
    }
  }
}
