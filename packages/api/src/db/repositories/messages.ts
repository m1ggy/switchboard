import pool from '@/lib/pg';
import { Message, MessageDirection, MessageStatus } from '@/types/db';

export const MessagesRepository = {
  /**
   * Create a new message
   */
  async create({
    id,
    numberId,
    message,
    contactId,
    inboxId,
    meta,
    status,
    direction,
    createdAt,
  }: {
    id: string;
    numberId: string;
    message: string;
    contactId: string;
    inboxId: string;
    meta?: Record<string, unknown>;
    status?: MessageStatus;
    direction: MessageDirection;
    createdAt?: Date;
  }): Promise<Message> {
    const res = await pool.query<Message>(
      `INSERT INTO messages (
         id, number_id, message, contact_id, inbox_id,
         meta, status, direction, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9
       ) RETURNING *`,
      [
        id,
        numberId,
        message,
        contactId,
        inboxId,
        meta || null,
        status || null,
        direction,
        createdAt || new Date(),
      ]
    );

    return res.rows[0];
  },

  /**
   * Find all messages for an inbox
   */
  async findByInbox(inboxId: string): Promise<Message[]> {
    const res = await pool.query<Message>(
      `SELECT * FROM messages
       WHERE inbox_id = $1
       ORDER BY created_at DESC`,
      [inboxId]
    );
    return res.rows;
  },

  /**
   * Get recent messages for a contact
   */
  async findLatestByContact(contactId: string, limit = 10): Promise<Message[]> {
    const res = await pool.query<Message>(
      `SELECT * FROM messages
       WHERE contact_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [contactId, limit]
    );
    return res.rows;
  },
};
