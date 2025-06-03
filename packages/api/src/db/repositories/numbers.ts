import pool from '@/lib/pg';
import { NumberEntry } from '@/types/db';

export const NumbersRepository = {
  /**
   * Create a new number entry
   */
  async create({
    id,
    companyId,
    number,
    createdAt,
  }: {
    id: string;
    companyId: string;
    number: string;
    createdAt: Date;
  }): Promise<NumberEntry> {
    const res = await pool.query<NumberEntry>(
      `INSERT INTO numbers (id, company_id, number, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, companyId, number, createdAt]
    );
    return res.rows[0];
  },

  /**
   * Find a number by ID
   */
  async findById(id: string): Promise<NumberEntry | null> {
    const res = await pool.query<NumberEntry>(
      `SELECT * FROM numbers WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  /**
   * Get all numbers for a given company
   */
  async findByCompany(companyId: string): Promise<NumberEntry[]> {
    const res = await pool.query<NumberEntry>(
      `SELECT * FROM numbers WHERE company_id = $1`,
      [companyId]
    );
    return res.rows;
  },

  /**
   * Delete a number entry
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM numbers WHERE id = $1`, [id]);
  },
  async findByNumber(number: string): Promise<NumberEntry | null> {
    const res = await pool.query<NumberEntry>(
      `SELECT * FROM numbers WHERE number = $1`,
      [number]
    );

    console.log('findByNumber: ', res);
    return res.rows?.[0] || null;
  },
};
