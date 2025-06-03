import pool from '@/lib/pg';
import { Inbox, InboxWithDetails } from '@/types/db';

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

  async findByNumberId(numberId: string): Promise<InboxWithDetails[]> {
    const result = await pool.query(
      `
    SELECT 
      i.id,
      i.number_id,
      i.contact_id,
      i.last_message_id,
      i.last_call_id,

      to_jsonb(c) AS contact,
      to_jsonb(lm) AS "lastMessage",
      to_jsonb(lc) AS "lastCall"
    FROM inboxes i
    JOIN contacts c ON i.contact_id = c.id
    LEFT JOIN messages lm ON i.last_message_id = lm.id
    LEFT JOIN calls lc ON i.last_call_id = lc.id
    WHERE i.number_id = $1
    ORDER BY lm.created_at DESC NULLS LAST
    `,
      [numberId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      numberId: row.number_id,
      contactId: row.contact_id,
      lastMessageId: row.last_message_id,
      lastCallId: row.last_call_id,
      contact: row.contact,
      lastMessage: row.lastMessage,
      lastCall: row.lastCall,
    }));
  },
};
