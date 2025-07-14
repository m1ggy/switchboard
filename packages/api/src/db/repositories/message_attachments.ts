import pool from '@/lib/pg';
import type { MediaAttachment } from '@/types/db';

export const MediaAttachmentsRepository = {
  /**
   * Create a new media attachment
   */
  async create({
    id,
    message_id,
    media_url,
    content_type,
    file_name,
  }: {
    id: string;
    message_id: string;
    media_url: string;
    content_type: string;
    file_name?: string | null;
  }): Promise<MediaAttachment> {
    const res = await pool.query<MediaAttachment>(
      `INSERT INTO media_attachments (
         id, message_id, media_url, content_type, file_name
       ) VALUES (
         $1, $2, $3, $4, $5
       ) RETURNING *`,
      [id, message_id, media_url, content_type, file_name || null]
    );

    return res.rows[0];
  },

  /**
   * Find all attachments for a message
   */
  async findByMessageId(messageId: string): Promise<MediaAttachment[]> {
    const res = await pool.query<MediaAttachment>(
      `SELECT * FROM media_attachments
       WHERE message_id = $1
       ORDER BY created_at ASC`,
      [messageId]
    );
    return res.rows;
  },

  /**
   * Delete all attachments for a message
   */
  async deleteByMessageId(messageId: string): Promise<void> {
    await pool.query(`DELETE FROM media_attachments WHERE message_id = $1`, [
      messageId,
    ]);
  },

  /**
   * Delete a specific attachment by ID
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM media_attachments WHERE id = $1`, [id]);
  },
};
