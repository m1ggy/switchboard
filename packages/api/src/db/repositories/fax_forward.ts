import pool from '@/lib/pg';
import { FaxForwardLog } from '@/types/db';

export const FaxForwardLogRepository = {
  /**
   * Create a new fax-forward log entry
   */
  async create({
    id,
    call_sid,
    from_number,
    to_number,
    forwarded_to_fax_at = new Date(),
    status = 'forwarded',
  }: {
    id: string;
    call_sid: string;
    from_number: string;
    to_number: string;
    forwarded_to_fax_at?: Date;
    status?: 'forwarded' | 'confirmed';
  }): Promise<FaxForwardLog> {
    const res = await pool.query<FaxForwardLog>(
      `INSERT INTO fax_forward_logs (
         id, call_sid, from_number, to_number, forwarded_to_fax_at, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6
       ) RETURNING *`,
      [id, call_sid, from_number, to_number, forwarded_to_fax_at, status]
    );

    return res.rows[0];
  },

  /**
   * Find a fax forward log by call SID
   */
  async findBySID(call_sid: string): Promise<FaxForwardLog | null> {
    const res = await pool.query<FaxForwardLog>(
      `SELECT * FROM fax_forward_logs WHERE call_sid = $1 LIMIT 1`,
      [call_sid]
    );
    return res.rows[0] || null;
  },

  /**
   * Mark a fax as confirmed (e.g. after webhook)
   */
  async markConfirmed(call_sid: string): Promise<FaxForwardLog | null> {
    const res = await pool.query<FaxForwardLog>(
      `UPDATE fax_forward_logs
       SET status = 'confirmed',
           updated_at = NOW()
       WHERE call_sid = $1
       RETURNING *`,
      [call_sid]
    );
    return res.rows[0] || null;
  },

  /**
   * Get recent forwarded fax logs
   */
  async listRecent(limit = 50): Promise<FaxForwardLog[]> {
    const res = await pool.query<FaxForwardLog>(
      `SELECT * FROM fax_forward_logs
       ORDER BY forwarded_to_fax_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  },
};
