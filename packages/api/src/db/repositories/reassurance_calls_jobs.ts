// src/db/repositories/reassuranceCallJobs.ts
import pool from '@/lib/pg';
import { ReassuranceCallJob } from '@/types/db';
import { type PoolClient } from 'pg';

export const ReassuranceCallJobsRepository = {
  async findActiveForSchedule(
    scheduleId: number
  ): Promise<ReassuranceCallJob | null> {
    const res = await pool.query<ReassuranceCallJob>(
      `
    SELECT *
    FROM reassurance_call_jobs
    WHERE schedule_id = $1
      AND status IN ('pending', 'processing')
    ORDER BY run_at ASC
    LIMIT 1
    `,
      [scheduleId]
    );

    return res.rows[0] || null;
  },

  /**
   * Create a new job (include)
   */
  async include(
    {
      id,
      schedule_id,
      run_at,
      attempt,
      status,
    }: {
      id: string;
      schedule_id: number;
      run_at: Date;
      attempt: number;
      status: 'pending' | 'running' | 'completed' | 'failed';
    },
    db: PoolClient | typeof pool = pool
  ) {
    await db.query(
      `
      INSERT INTO reassurance_call_jobs (
        id, schedule_id, run_at, attempt, status
      ) VALUES (
        $1, $2, $3, $4, $5
      )
      `,
      [id, schedule_id, run_at, attempt, status]
    );
  },

  /**
   * Find a job by ID
   */
  async findById(id: string): Promise<ReassuranceCallJob | null> {
    const res = await pool.query<ReassuranceCallJob>(
      `SELECT * FROM reassurance_call_jobs WHERE id = $1`,
      [id]
    );

    return res.rows[0] || null;
  },

  /**
   * Find due jobs (pending and run_at <= now)
   */
  async findDue(limit = 50): Promise<ReassuranceCallJob[]> {
    const res = await pool.query<ReassuranceCallJob>(
      `
      SELECT *
      FROM reassurance_call_jobs
      WHERE status = 'pending'
        AND run_at <= NOW()
      ORDER BY run_at ASC
      LIMIT $1
      `,
      [limit]
    );

    return res.rows;
  },

  /**
   * Mark a job as processing
   */
  async markProcessing(id: string): Promise<void> {
    await pool.query(
      `
      UPDATE reassurance_call_jobs
      SET status = 'processing'
      WHERE id = $1
      `,
      [id]
    );
  },

  /**
   * Mark a job as completed
   */
  async markCompleted(id: string): Promise<void> {
    await pool.query(
      `
      UPDATE reassurance_call_jobs
      SET status = 'completed'
      WHERE id = $1
      `,
      [id]
    );
  },

  /**
   * Mark a job as failed with an error message
   */
  async markFailed(id: string, error: string): Promise<void> {
    await pool.query(
      `
      UPDATE reassurance_call_jobs
      SET status = 'failed',
          last_error = $2
      WHERE id = $1
      `,
      [id, error]
    );
  },

  /**
   * Optionally reschedule a job (for retries, etc.)
   * Will set status back to 'pending' and update run_at / attempt.
   */
  async reschedule(
    id: string,
    {
      run_at,
      attempt,
    }: {
      run_at: Date;
      attempt?: number;
    }
  ): Promise<ReassuranceCallJob | null> {
    const fields: string[] = ['run_at = $2', "status = 'pending'"];
    const values: any[] = [id, run_at.toISOString()];
    let paramIndex = 3;

    if (typeof attempt === 'number') {
      fields.push(`attempt = $${paramIndex}`);
      values.push(attempt);
      paramIndex++;
    }

    const res = await pool.query<ReassuranceCallJob>(
      `
      UPDATE reassurance_call_jobs
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
      `,
      values
    );

    return res.rows[0] || null;
  },

  /**
   * Delete a job (if ever needed)
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM reassurance_call_jobs WHERE id = $1`, [id]);
  },

  async reschedulePendingForSchedule(
    scheduleId: number,
    run_at: Date
  ): Promise<ReassuranceCallJob[]> {
    const res = await pool.query<ReassuranceCallJob>(
      `
      UPDATE reassurance_call_jobs
      SET run_at = $2
      WHERE schedule_id = $1
        AND status = 'pending'
      RETURNING *
      `,
      [scheduleId, run_at.toISOString()]
    );

    return res.rows;
  },

  /**
   * Check if schedule already has an upcoming run (pending/processing)
   * at or after a given time.
   *
   * Used by cron seeding: if none exists, create a new run.
   */
  async existsUpcomingForSchedule(
    scheduleId: number,
    fromRunAt: Date
  ): Promise<boolean> {
    const res = await pool.query<{ exists: boolean }>(
      `
      SELECT EXISTS(
        SELECT 1
        FROM reassurance_call_jobs
        WHERE schedule_id = $1
          AND status IN ('pending', 'processing')
          AND run_at >= $2
      ) AS exists
      `,
      [scheduleId, fromRunAt.toISOString()]
    );

    return Boolean(res.rows[0]?.exists);
  },

  /**
   * Atomically claim a pending job for processing.
   * Returns true if this worker claimed it, false if it was already claimed.
   */
  async claimPending(id: string): Promise<boolean> {
    const res = await pool.query(
      `
      UPDATE reassurance_call_jobs
      SET status = 'processing'
      WHERE id = $1
        AND status = 'pending'
      RETURNING id
      `,
      [id]
    );

    return res.rowCount === 1;
  },
};
