import pool from '@/lib/pg';
import { Plan } from '@/types/db';

export type PlanUsageLimit = {
  plan_id: string;
  metric_id: string;
  metric_key: string;
  metric_name: string;
  unit: string;
  included_quantity: string; // NUMERIC comes back as string from node-postgres
};

export const PlansRepository = {
  async create({
    id,
    name,
    description,
    stripe_price_id,
    monthly_price,
    created_at,
  }: Partial<Plan> & {
    name: string;
    stripe_price_id: string;
    monthly_price: number;
  }): Promise<Plan> {
    const res = await pool.query<Plan>(
      `INSERT INTO plans (id, name, description, stripe_price_id, monthly_price, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        name,
        description || null,
        stripe_price_id,
        monthly_price,
        created_at || new Date(),
      ]
    );
    return res.rows[0];
  },

  async findById(id: string): Promise<Plan | null> {
    const res = await pool.query<Plan>(`SELECT * FROM plans WHERE id = $1`, [
      id,
    ]);
    return res.rows[0] || null;
  },

  async findByStripePriceId(stripe_price_id: string): Promise<Plan | null> {
    const res = await pool.query<Plan>(
      `SELECT * FROM plans WHERE stripe_price_id = $1`,
      [stripe_price_id]
    );
    return res.rows[0] || null;
  },

  async findByPlanName(name: string): Promise<Plan | null> {
    const res = await pool.query<Plan>(`SELECT * FROM plans WHERE name = $1`, [
      name,
    ]);
    return res.rows[0] || null;
  },

  async findAll(): Promise<Plan[]> {
    const res = await pool.query<Plan>(
      `SELECT * FROM plans ORDER BY monthly_price ASC`
    );
    return res.rows;
  },

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM plans WHERE id = $1`, [id]);
  },

  // ---------- NEW: plan limits ----------
  /**
   * Get all usage limits for a plan by its ID.
   * Returns one row per metric with included quantity and metric metadata.
   */
  async getUsageLimitsByPlanId(planId: string): Promise<PlanUsageLimit[]> {
    const res = await pool.query<PlanUsageLimit>(
      `
      SELECT
        pul.plan_id,
        um.id        AS metric_id,
        um.key       AS metric_key,
        um.name      AS metric_name,
        um.unit      AS unit,
        pul.included_quantity::text AS included_quantity
      FROM plan_usage_limits pul
      JOIN usage_metrics um ON um.id = pul.metric_id
      WHERE pul.plan_id = $1
      ORDER BY um.key ASC
      `,
      [planId]
    );
    return res.rows;
  },

  /**
   * Convenience: get usage limits for a plan by its name.
   */
  async getUsageLimitsByPlanName(name: string): Promise<PlanUsageLimit[]> {
    const res = await pool.query<{ id: string }>(
      `SELECT id FROM plans WHERE name = $1`,
      [name]
    );
    const plan = res.rows[0];
    if (!plan) return [];
    return this.getUsageLimitsByPlanId(plan.id);
  },

  /**
   * (Optional) Get a single metric limit for a plan by metric key.
   */
  async getUsageLimitForMetric(
    planId: string,
    metricKey: string
  ): Promise<PlanUsageLimit | null> {
    const res = await pool.query<PlanUsageLimit>(
      `
      SELECT
        pul.plan_id,
        um.id        AS metric_id,
        um.key       AS metric_key,
        um.name      AS metric_name,
        um.unit      AS unit,
        pul.included_quantity::text AS included_quantity
      FROM plan_usage_limits pul
      JOIN usage_metrics um ON um.id = pul.metric_id
      WHERE pul.plan_id = $1 AND um.key = $2
      LIMIT 1
      `,
      [planId, metricKey]
    );
    return res.rows[0] || null;
  },
};
