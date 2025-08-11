import pool from '@/lib/pg';
import { Usage } from '@/types/db';

export const UsageRepository = {
  /**
   * Create a new usage record
   */
  async create({
    id,
    subscription_id,
    user_id,
    amount,
    type,
    created_at,
  }: {
    id: string;
    subscription_id: string;
    user_id: string;
    amount: number;
    type: Usage['type'];
    created_at?: Date;
  }): Promise<Usage> {
    const res = await pool.query<Usage>(
      `INSERT INTO usage (id, subscription_id, user_id, amount, type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, subscription_id, user_id, amount, type, created_at || new Date()]
    );
    return res.rows[0];
  },

  /**
   * Find a usage record by ID
   */
  async findById(id: string): Promise<Usage | null> {
    const res = await pool.query<Usage>(`SELECT * FROM usage WHERE id = $1`, [
      id,
    ]);
    return res.rows[0] || null;
  },

  /**
   * Get all usage records for a subscription
   */
  async findBySubscription(subscription_id: string): Promise<Usage[]> {
    const res = await pool.query<Usage>(
      `SELECT * FROM usage WHERE subscription_id = $1 ORDER BY created_at DESC`,
      [subscription_id]
    );
    return res.rows;
  },

  /**
   * Get all usage records for a user
   */
  async findByUser(user_id: string): Promise<Usage[]> {
    const res = await pool.query<Usage>(
      `SELECT * FROM usage WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );
    return res.rows;
  },

  /**
   * Get current month's usage totals for a user, grouped by type
   */
  async getCurrentMonthTotalsByUser(
    user_id: string
  ): Promise<Record<string, number>> {
    const res = await pool.query<{ type: string; total: string }>(
      `
    SELECT type, COALESCE(SUM(amount), 0) AS total
    FROM usage
    WHERE user_id = $1
      AND created_at >= date_trunc('month', CURRENT_DATE)
      AND created_at < date_trunc('month', CURRENT_DATE) + interval '1 month'
    GROUP BY type
    `,
      [user_id]
    );

    return res.rows.reduce(
      (acc, row) => {
        acc[row.type] = parseInt(row.total, 10);
        return acc;
      },
      {} as Record<string, number>
    );
  },

  /**
   * Delete a usage record by ID
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM usage WHERE id = $1`, [id]);
  },
};
