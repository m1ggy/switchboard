import pool from '@/lib/pg';
import { User } from '@/types/db';

export const UsersRepository = {
  /**
   * Create a new user
   */
  async create({
    id,
    email,
    first_name,
    last_name,
    stripe_customer_id,
    onboarding_step = 1,
    onboarding_completed = false,
    user_id,
  }: Partial<User> & { id: string; email: string }): Promise<User> {
    const res = await pool.query<User>(
      `INSERT INTO users (
         id, email, first_name, last_name, stripe_customer_id,
         onboarding_step, onboarding_completed, user_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8
       ) RETURNING *`,
      [
        id,
        email,
        first_name || null,
        last_name || null,
        stripe_customer_id || null,
        onboarding_step,
        onboarding_completed,
        user_id,
      ]
    );

    return res.rows[0];
  },

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const res = await pool.query<User>(`SELECT * FROM users WHERE id = $1`, [
      id,
    ]);
    return res.rows[0] || null;
  },

  async findByFirebaseUid(uid: string): Promise<User | null> {
    const res = await pool.query<User>(
      `SELECT * FROM users WHERE user_id = $1`,
      [uid]
    );

    return res.rows[0] || null;
  },

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const res = await pool.query<User>(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);
    return res.rows[0] || null;
  },

  /**
   * Find user by Stripe customer ID
   */
  async findByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
    const res = await pool.query<User>(
      `SELECT * FROM users WHERE stripe_customer_id = $1`,
      [stripeCustomerId]
    );
    return res.rows[0] || null;
  },

  /**
   * Update user by ID
   */
  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const fields: string[] = [];
    const values: (string | boolean | Date | number)[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('No fields provided to update.');
    }

    values.push(id); // final param is user ID

    const res = await pool.query<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`,
      values
    );

    return res.rows[0] || null;
  },

  /**
   * Delete user by ID
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  },
};
