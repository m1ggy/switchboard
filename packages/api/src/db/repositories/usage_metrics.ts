import pool from '@/lib/pg';
import { UsageMetric } from '@/types/db';

export const UsageMetricsRepository = {
  async create({
    id,
    key,
    name,
    unit,
  }: Partial<UsageMetric> & {
    key: string;
    name: string;
    unit: string;
  }): Promise<UsageMetric> {
    const res = await pool.query<UsageMetric>(
      `INSERT INTO usage_metrics (id, key, name, unit)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, key, name, unit]
    );
    return res.rows[0];
  },

  async findById(id: string): Promise<UsageMetric | null> {
    const res = await pool.query<UsageMetric>(
      `SELECT * FROM usage_metrics WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async findAll(): Promise<UsageMetric[]> {
    const res = await pool.query<UsageMetric>(
      `SELECT * FROM usage_metrics ORDER BY name ASC`
    );
    return res.rows;
  },

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM usage_metrics WHERE id = $1`, [id]);
  },
};
