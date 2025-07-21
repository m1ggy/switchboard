import pool from '@/lib/pg';
import { UserOnboardingProgress } from '@/types/db';

export const UserOnboardingRepository = {
  /**
   * Initialize onboarding progress for a new user
   */
  async create(user_id: string): Promise<UserOnboardingProgress> {
    const res = await pool.query<UserOnboardingProgress>(
      `INSERT INTO user_onboarding_progress (
         user_id
       ) VALUES ($1)
       RETURNING *`,
      [user_id]
    );

    return res.rows[0];
  },

  /**
   * Get onboarding status for a user
   */
  async findByUserId(user_id: string): Promise<UserOnboardingProgress | null> {
    const res = await pool.query<UserOnboardingProgress>(
      `SELECT * FROM user_onboarding_progress WHERE user_id = $1`,
      [user_id]
    );

    return res.rows[0] || null;
  },

  /**
   * Update onboarding steps for a user
   */
  async update(
    user_id: string,
    updates: Partial<Omit<UserOnboardingProgress, 'user_id' | 'updated_at'>>
  ): Promise<UserOnboardingProgress | null> {
    const fields = [];
    const values = [];
    let i = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${i}`);
      values.push(value);
      i++;
    }

    if (fields.length === 0) {
      throw new Error('No fields to update.');
    }

    values.push(user_id);

    const res = await pool.query<UserOnboardingProgress>(
      `UPDATE user_onboarding_progress
       SET ${fields.join(', ')}, updated_at = now()
       WHERE user_id = $${i}
       RETURNING *`,
      values
    );

    return res.rows[0] || null;
  },

  /**
   * Delete onboarding record (e.g. for account deletion)
   */
  async delete(user_id: string): Promise<void> {
    await pool.query(
      `DELETE FROM user_onboarding_progress WHERE user_id = $1`,
      [user_id]
    );
  },
};
