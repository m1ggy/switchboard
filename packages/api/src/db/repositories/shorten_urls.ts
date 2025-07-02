import pool from '@/lib/pg';
import { nanoid } from 'nanoid';

export interface ShortenUrl {
  id: string;
  full_url: string;
  create_at: Date;
  created_by: string;
  company_id: string;
}

export const ShortenUrlRepository = {
  /**
   * Create a new shortened URL
   */
  async create({
    full_url,
    created_by,
    company_id,
  }: {
    full_url: string;
    created_by: string;
    company_id: string;
  }): Promise<ShortenUrl> {
    const id = nanoid(8); // Compact and URL-friendly short ID
    const res = await pool.query<ShortenUrl>(
      `INSERT INTO shorten_urls (
         id, full_url, create_at, created_by, company_id
       ) VALUES (
         $1, $2, $3, $4, $5
       ) RETURNING *`,
      [id, full_url, new Date(), created_by, company_id]
    );
    return res.rows[0];
  },

  /**
   * Retrieve a shortened URL by its short ID
   */
  async findById(id: string): Promise<ShortenUrl | null> {
    const res = await pool.query<ShortenUrl>(
      `SELECT * FROM shorten_urls WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  /**
   * List all shortened URLs created by a specific user
   */
  async findByUser(userId: string): Promise<ShortenUrl[]> {
    const res = await pool.query<ShortenUrl>(
      `SELECT * FROM shorten_urls
       WHERE created_by = $1
       ORDER BY create_at DESC`,
      [userId]
    );
    return res.rows;
  },

  /**
   * Delete a shortened URL by its ID
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM shorten_urls WHERE id = $1`, [id]);
  },

  /**
   * Find or create a short URL for the same user and full URL
   */
  async findOrCreate({
    full_url,
    created_by,
    company_id,
  }: {
    full_url: string;
    created_by: string;
    company_id: string;
  }): Promise<ShortenUrl> {
    const existing = await pool.query<ShortenUrl>(
      `SELECT * FROM shorten_urls
       WHERE full_url = $1 AND created_by = $2
       LIMIT 1`,
      [full_url, created_by]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    return this.create({ full_url, created_by, company_id });
  },
};
