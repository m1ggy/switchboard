import pool from '@/lib/pg';
import { Inbox } from '@/types/db';

export const InboxesRepository = {
  async findOrCreate({
    numberId,
    contactId,
  }: {
    numberId: string;
    contactId: string;
  }): Promise<Inbox> {
    const existing = await pool.query<Inbox>(
      `SELECT * FROM inboxes WHERE number_id = $1 AND contact_id = $2`,
      [numberId, contactId]
    );

    if (existing.rows[0]) return existing.rows[0];

    const res = await pool.query<Inbox>(
      `INSERT INTO inboxes (id, number_id, contact_id)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING *`,
      [numberId, contactId]
    );

    return res.rows[0];
  },

  async updateLastMessage(inboxId: string, messageId: string): Promise<void> {
    await pool.query(`UPDATE inboxes SET last_message_id = $1 WHERE id = $2`, [
      messageId,
      inboxId,
    ]);
  },
};
