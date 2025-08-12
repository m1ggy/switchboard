import pool from '@/lib/pg';
import { PlanUsageLimit } from '@/types/db';

export type PlanUsageLimitWithOverage = PlanUsageLimit & {
  metric_key: string; // e.g. 'sms_sent' | 'minutes_combined'
  metric_name: string; // human name from usage_metrics
  metric_unit: string; // unit from usage_metrics (e.g. 'message', 'minute')
  overage_price_per_unit: string | null; // NUMERIC from plan_usage_overages (string from pg)
  overage_unit: string | null; // unit from plan_usage_overages (falls back to metric unit if you prefer)
};

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
      `SELECT pul.*, um.key AS metric_key, um.name AS metric_name, um.unit
       FROM plan_usage_limits pul
       JOIN usage_metrics um ON pul.metric_id = um.id
       WHERE pul.plan_id = $1`,
      [plan_id]
    );
    return res.rows;
  },

  // NEW: limits + overages (LEFT JOIN so it works even if an overage row is missing)
  async findByPlanWithOverages(
    plan_id: string
  ): Promise<PlanUsageLimitWithOverage[]> {
    const res = await pool.query<PlanUsageLimitWithOverage>(
      `SELECT
         pul.*,
         um.key  AS metric_key,
         um.name AS metric_name,
         um.unit AS metric_unit,
         puo.overage_price_per_unit,
         puo.unit AS overage_unit
       FROM plan_usage_limits pul
       JOIN usage_metrics um
         ON um.id = pul.metric_id
       LEFT JOIN plan_usage_overages puo
         ON puo.plan_id = pul.plan_id
        AND puo.metric_id = pul.metric_id
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
      `UPDATE plan_usage_limits
         SET included_quantity = $1
       WHERE id = $2
       RETURNING *`,
      [included_quantity, id]
    );
    return res.rows[0] || null;
  },

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM plan_usage_limits WHERE id = $1`, [id]);
  },
};
