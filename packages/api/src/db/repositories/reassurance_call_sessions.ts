import pool from '@/lib/pg';
import { ReassuranceCallSession } from '@/types/db';

export const ReassuranceCallSessionsRepository = {
  async createSession({
    id,
    schedule_id,
    job_id,
    call_id,
    contact_id,
    risk_level,
    ai_model,
    started_at,
  }: Partial<ReassuranceCallSession> & {
    id: string;
    schedule_id: number;
    call_id: string;
    contact_id: string;
  }): Promise<ReassuranceCallSession> {
    const res = await pool.query<ReassuranceCallSession>(
      `
      INSERT INTO reassurance_call_sessions (
        id,
        schedule_id,
        job_id,
        call_id,
        contact_id,
        started_at,
        status,
        risk_level,
        ai_model
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', $7, $8)
      RETURNING *
      `,
      [
        id,
        schedule_id,
        job_id ?? null,
        call_id,
        contact_id,
        started_at || new Date(),
        risk_level ?? null,
        ai_model ?? null,
      ]
    );

    return res.rows[0];
  },

  async findById(id: string): Promise<ReassuranceCallSession | null> {
    const res = await pool.query<ReassuranceCallSession>(
      `SELECT * FROM reassurance_call_sessions WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async findByCallId(callId: string): Promise<ReassuranceCallSession | null> {
    const res = await pool.query<ReassuranceCallSession>(
      `SELECT * FROM reassurance_call_sessions WHERE call_id = $1`,
      [callId]
    );
    return res.rows[0] || null;
  },

  async listByContactId(
    contactId: string,
    limit = 20
  ): Promise<ReassuranceCallSession[]> {
    const res = await pool.query<ReassuranceCallSession>(
      `
      SELECT *
      FROM reassurance_call_sessions
      WHERE contact_id = $1
      ORDER BY started_at DESC
      LIMIT $2
      `,
      [contactId, limit]
    );
    return res.rows;
  },

  async getLatestByContactId(
    contactId: string
  ): Promise<ReassuranceCallSession | null> {
    const res = await pool.query<ReassuranceCallSession>(
      `
      SELECT *
      FROM reassurance_call_sessions
      WHERE contact_id = $1
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [contactId]
    );
    return res.rows[0] || null;
  },

  /**
   * Mark a session as completed/failed/etc. and optionally update
   * summary/risk/notes and ended_at.
   */
  async finalizeSession(
    sessionId: string,
    {
      status,
      risk_level,
      ai_summary,
      notes_for_human,
      ended_at,
    }: {
      status: 'completed' | 'user_hung_up' | 'failed' | 'escalated';
      risk_level?: string | null;
      ai_summary?: string | null;
      notes_for_human?: string | null;
      ended_at?: Date;
    }
  ): Promise<ReassuranceCallSession | null> {
    const res = await pool.query<ReassuranceCallSession>(
      `
      UPDATE reassurance_call_sessions
      SET
        status = $2,
        risk_level = COALESCE($3, risk_level),
        ai_summary = COALESCE($4, ai_summary),
        notes_for_human = COALESCE($5, notes_for_human),
        ended_at = COALESCE($6, ended_at)
      WHERE id = $1
      RETURNING *
      `,
      [
        sessionId,
        status,
        risk_level ?? null,
        ai_summary ?? null,
        notes_for_human ?? null,
        ended_at || new Date(),
      ]
    );
    return res.rows[0] || null;
  },

  /**
   * Simple status update without touching summary/etc.
   */
  async updateStatus(
    sessionId: string,
    status:
      | 'in_progress'
      | 'completed'
      | 'user_hung_up'
      | 'failed'
      | 'escalated'
  ): Promise<void> {
    await pool.query(
      `
      UPDATE reassurance_call_sessions
      SET status = $2
      WHERE id = $1
      `,
      [sessionId, status]
    );
  },
};
