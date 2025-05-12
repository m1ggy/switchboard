import pool from '@/lib/pg';
import { Notification } from '@/types/db';

export const NotificationsRepository = {
  /**
   * Create a new notification
   */
  async create({
    id,
    message,
    createdAt,
    meta = {},
    viewed = false,
    userId,
    viewedAt = null,
    type = 'user',
  }: {
    id: string;
    message: string;
    createdAt: Date;
    meta?: Record<string, unknown>;
    viewed?: boolean;
    userId?: string | null;
    viewedAt?: Date | null;
    type?: string;
  }): Promise<Notification> {
    const res = await pool.query<Notification>(
      `INSERT INTO notifications (id, message, created_at, meta, viewed, user_id, viewed_at, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, message, createdAt, meta, viewed, userId, viewedAt, type]
    );
    return res.rows[0];
  },

  /**
   * Find a notification by ID
   */
  async findById(id: string): Promise<Notification | null> {
    const res = await pool.query<Notification>(
      `SELECT * FROM notifications WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  /**
   * Get all notifications for a given user
   */
  async findByUser(userId: string): Promise<Notification[]> {
    const res = await pool.query<Notification>(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  },

  /**
   * Get unread notifications for a user
   */
  async findUnreadByUser(userId: string): Promise<Notification[]> {
    const res = await pool.query<Notification>(
      `SELECT * FROM notifications WHERE user_id = $1 AND viewed = false ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  },

  /**
   * Mark a notification as viewed
   */
  async markAsViewed(id: string, viewedAt: Date): Promise<void> {
    await pool.query(
      `UPDATE notifications SET viewed = true, viewed_at = $2 WHERE id = $1`,
      [id, viewedAt]
    );
  },

  /**
   * Delete a notification
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM notifications WHERE id = $1`, [id]);
  },
};
