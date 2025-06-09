import pool from '@/lib/pg';
import { Call, Contact } from '@/types/db';

export const CallsRepository = {
  /**
   * Create a new call log
   */
  async create({
    id,
    number_id,
    contact_id,
    initiated_at,
    duration,
    meta,
    call_sid,
  }: {
    id: string;
    number_id: string;
    contact_id: string;
    initiated_at?: Date;
    duration?: number;
    meta?: Record<string, unknown>;
    call_sid: string;
  }): Promise<Call> {
    const res = await pool.query<Call>(
      `INSERT INTO calls (
         id, number_id, contact_id, initiated_at, duration, meta, call_sid
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7
       ) RETURNING *`,
      [
        id,
        number_id,
        contact_id,
        initiated_at?.toISOString() || new Date().toISOString(),
        duration || null,
        meta || null,
        call_sid,
      ]
    );

    return res.rows[0];
  },

  /**
   * Find a call by ID
   */
  async findById(id: string): Promise<Call | null> {
    const res = await pool.query<Call>(`SELECT * FROM calls WHERE id = $1`, [
      id,
    ]);
    return res.rows[0] || null;
  },

  /**
   * Get recent calls for a contact (optional limit)
   */
  async findByContact(contactId: string, limit = 10): Promise<Call[]> {
    const res = await pool.query<Call>(
      `SELECT * FROM calls
       WHERE contact_id = $1
       ORDER BY initiated_at DESC
       LIMIT $2`,
      [contactId, limit]
    );
    return res.rows;
  },

  /**
   * Get all calls for a number
   */
  async findByNumber(numberId: string): Promise<Call[]> {
    const res = await pool.query<Call>(
      `SELECT * FROM calls WHERE number_id = $1 ORDER BY initiated_at DESC`,
      [numberId]
    );
    return res.rows;
  },

  /**
   * Get all calls for a number, including contact details
   */
  async findByNumberWithContact(
    numberId: string
  ): Promise<(Call & { contact: Contact })[]> {
    const res = await pool.query(
      `
    SELECT 
      calls.*,
      jsonb_build_object(
        'id', contacts.id,
        'number', contacts.number,
        'created_at', contacts.created_at,
        'company_id', contacts.company_id,
        'label', contacts.label
      ) AS contact
    FROM calls
    JOIN contacts ON calls.contact_id = contacts.id
    WHERE calls.number_id = $1
    ORDER BY calls.initiated_at DESC
    `,
      [numberId]
    );

    return res.rows.map((row) => ({
      ...row,
      contact: row.contact,
    }));
  },

  /**
   * Delete a call by ID
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM calls WHERE id = $1`, [id]);
  },

  async findBySID(sid: string): Promise<Call | null> {
    const res = await pool.query('SELECT * FROM calls WHERE call_sid = $1', [
      sid,
    ]);

    return res.rows?.[0] ?? null;
  },

  async update(sid: string, updates: Partial<Call>): Promise<Call | null> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('No fields provided to update.');
    }

    values.push(sid); // last value is the call_sid

    const res = await pool.query<Call>(
      `UPDATE calls SET ${fields.join(', ')} WHERE call_sid = $${paramIndex} RETURNING *`,
      values
    );

    return res.rows[0] || null;
  },
};
