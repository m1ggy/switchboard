import pool from '@/lib/pg';
import { ReassuranceCallTurn } from '@/types/db';

export const ReassuranceCallTurnsRepository = {
  async createTurn({
    id,
    session_id,
    role,
    content,
    meta,
    created_at,
  }: Partial<ReassuranceCallTurn> & {
    id: string;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  }): Promise<ReassuranceCallTurn> {
    const res = await pool.query<ReassuranceCallTurn>(
      `
      INSERT INTO reassurance_call_turns (
        id,
        session_id,
        role,
        content,
        created_at,
        meta
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [id, session_id, role, content, created_at || new Date(), meta ?? null]
    );

    return res.rows[0];
  },

  async listBySessionId(sessionId: string): Promise<ReassuranceCallTurn[]> {
    const res = await pool.query<ReassuranceCallTurn>(
      `
      SELECT *
      FROM reassurance_call_turns
      WHERE session_id = $1
      ORDER BY created_at ASC
      `,
      [sessionId]
    );
    return res.rows;
  },

  async listBySessionIdWithLimit(
    sessionId: string,
    limit = 100
  ): Promise<ReassuranceCallTurn[]> {
    const res = await pool.query<ReassuranceCallTurn>(
      `
      SELECT *
      FROM reassurance_call_turns
      WHERE session_id = $1
      ORDER BY created_at ASC
      LIMIT $2
      `,
      [sessionId, limit]
    );
    return res.rows;
  },
};
