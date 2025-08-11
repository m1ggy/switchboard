import pool from '@/lib/pg';
import { PlanUsageLimit } from '@/types/db';

export const PlanUsageLimitsRepository = {
  async create({
    id,
    plan_id,
    metric_id,
    included_quantity,
  }: Partial<PlanUsageLimit> & {
    plan_id: string;
    metric_id: string;
    included_quantity: number;
  }): Promise<PlanUsageLimit> {
    const res = await pool.query<PlanUsageLimit>(
      `INSERT INTO plan_usage_limits (id, plan_id, metric_id, included_quantity)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, plan_id, metric_id, included_quantity]
    );
    return res.rows[0];
  },

  async findByPlan(plan_id: string): Promise<PlanUsageLimit[]> {
    const res = await pool.query<PlanUsageLimit>(
      `SELECT pul.*, um.key as metric_key, um.name as metric_name, um.unit
       FROM plan_usage_limits pul
       JOIN usage_metrics um ON pul.metric_id = um.id
       WHERE pul.plan_id = $1`,
      [plan_id]
    );
    return res.rows;
  },

  async updateIncludedQuantity(
    id: string,
    included_quantity: number
  ): Promise<PlanUsageLimit | null> {
    const res = await pool.query<PlanUsageLimit>(
      `UPDATE plan_usage_limits SET included_quantity = $1 WHERE id = $2 RETURNING *`,
      [included_quantity, id]
    );
    return res.rows[0] || null;
  },

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM plan_usage_limits WHERE id = $1`, [id]);
  },
};
