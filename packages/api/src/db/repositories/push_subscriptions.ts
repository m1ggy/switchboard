// src/db/repositories/push-subscriptions.ts
import pool from '@/lib/pg';

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null; // store milliseconds since epoch, nullable
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const PushSubscriptionsRepository = {
  /**
   * Upsert by unique endpoint. Associates (or re-associates) the endpoint to userId.
   */
  async upsert(
    userId: string,
    sub: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      expirationTime: number | null;
    },
    userAgent?: string | null
  ): Promise<void> {
    await pool.query(
      `
      INSERT INTO push_subscriptions
        (user_id, endpoint, p256dh, auth, expiration_time, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (endpoint) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            expiration_time = EXCLUDED.expiration_time,
            user_agent = EXCLUDED.user_agent,
            updated_at = NOW()
      `,
      [
        userId,
        sub.endpoint,
        sub.keys.p256dh,
        sub.keys.auth,
        sub.expirationTime,
        userAgent ?? null,
      ]
    );
  },

  /**
   * Delete a single subscription by endpoint for the given user.
   * (Ensures users can only delete their own endpoint rows.)
   */
  async deleteByEndpoint(userId: string, endpoint: string): Promise<void> {
    await pool.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userId, endpoint]
    );
  },

  /**
   * Delete many by endpoints (across any users). Used for cleanup after 404/410.
   */
  async deleteManyByEndpoints(endpoints: string[]): Promise<void> {
    if (!endpoints.length) return;
    // Postgres ANY(text[]) expects a text[]; node-postgres maps JS array -> Postgres array.
    await pool.query(
      `DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])`,
      [endpoints]
    );
  },

  /**
   * Get all subscriptions for a user.
   */
  async getAllByUser(userId: string): Promise<PushSubscriptionRecord[]> {
    const res = await pool.query<PushSubscriptionRecord>(
      `
      SELECT
        id,
        user_id    AS "userId",
        endpoint,
        p256dh,
        auth,
        expiration_time AS "expirationTime",
        user_agent AS "userAgent",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM push_subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );
    return res.rows;
  },
};
