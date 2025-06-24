import pool from '@/lib/pg';
import { CallNote } from '@/types/db';

export const CallNotesRepository = {
  /**
   * Create a new call note
   */
  async create({
    id,
    call_sid,
    room_id,
    note,
    contact_id,
    number_id,
    company_id,
  }: {
    id: string;
    call_sid?: string;
    room_id?: string;
    note: string;
    contact_id: string;
    number_id: string;
    company_id: string;
  }): Promise<CallNote> {
    const res = await pool.query<CallNote>(
      `INSERT INTO call_notes (
         id, call_sid, room_id, note, contact_id, number_id, company_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7
       ) RETURNING *`,
      [
        id,
        call_sid || null,
        room_id || null,
        note,
        contact_id,
        number_id,
        company_id,
      ]
    );

    return res.rows[0];
  },

  /**
   * Get all notes for a call_sid
   */
  async findByCallSID(call_sid: string): Promise<CallNote[]> {
    const res = await pool.query<CallNote>(
      `SELECT * FROM call_notes WHERE call_sid = $1 ORDER BY id DESC`,
      [call_sid]
    );
    return res.rows;
  },

  /**
   * Get all notes for a room_id (Jitsi)
   */
  async findByRoomID(room_id: string): Promise<CallNote[]> {
    const res = await pool.query<CallNote>(
      `SELECT * FROM call_notes WHERE room_id = $1 ORDER BY id DESC`,
      [room_id]
    );
    return res.rows;
  },

  /**
   * Get all notes for a contact
   */
  async findByContact(contactId: string): Promise<CallNote[]> {
    const res = await pool.query<CallNote>(
      `SELECT * FROM call_notes WHERE contact_id = $1 ORDER BY id DESC`,
      [contactId]
    );
    return res.rows;
  },

  /**
   * Delete a note by ID
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM call_notes WHERE id = $1`, [id]);
  },

  async edit(
    id: string,
    updates: Partial<Pick<CallNote, 'note' | 'call_sid' | 'room_id'>>
  ): Promise<CallNote | null> {
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

    values.push(id); // final param for WHERE clause

    const res = await pool.query<CallNote>(
      `UPDATE call_notes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return res.rows[0] || null;
  },
};
