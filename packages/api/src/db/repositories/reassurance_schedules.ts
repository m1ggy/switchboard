import pool from '@/lib/pg';
import { Call, ReassuranceCallSchedule } from '@/types/db';
import type { PoolClient } from 'pg';

export interface NumberRow {
  id: string;
  company_id: string;
  number: string;
  created_at: string;
  label: string | null;
}

type UpdateScheduleInput = {
  id: number;

  name: string;
  caller_name?: string | null;

  script_type: 'template' | 'custom';
  template?: string | null;
  script_content?: string | null;
  name_in_script: 'contact' | 'caller';

  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  frequency_days?: number | null;
  frequency_time: string;

  selected_days?: string[] | null;

  calls_per_day: number;
  max_attempts: number;
  retry_interval: number;

  is_active?: boolean | null;

  emergency_contact_name?: string | null;
  emergency_contact_phone_number?: string | null;
};

export type ScheduleCallLogRow = Call & {
  schedule: ReassuranceCallSchedule;
  number: NumberRow;
};

export const ReassuranceSchedulesRepository = {
  async include(
    input: {
      name: string;
      phone_number: string;
      caller_name?: string | null;
      emergency_contact_name?: string | null;
      emergency_contact_phone_number?: string | null;
      script_type: 'template' | 'custom';
      template?: string | null;
      script_content?: string | null;
      name_in_script: 'contact' | 'caller';
      frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
      frequency_days?: number | null;
      frequency_time: string;
      selected_days?: string[] | null;
      calls_per_day: number;
      max_attempts: number;
      retry_interval: number;
      company_id: string;
      number_id: string;
    },
    db: PoolClient | typeof pool = pool
  ): Promise<ReassuranceCallSchedule> {
    const res = await db.query<ReassuranceCallSchedule>(
      `
      INSERT INTO reassurance_call_schedules (
        name,
        phone_number,
        emergency_contact_name,
        emergency_contact_phone_number,
        caller_name,
        script_type,
        template,
        script_content,
        name_in_script,
        frequency,
        frequency_days,
        frequency_time,
        selected_days,
        calls_per_day,
        max_attempts,
        retry_interval,
        company_id,
        number_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )
      RETURNING *
      `,
      [
        input.name,
        input.phone_number,
        input.emergency_contact_name ?? null,
        input.emergency_contact_phone_number ?? null,
        input.caller_name ?? null,
        input.script_type,
        input.template ?? null,
        input.script_content ?? null,
        input.name_in_script,
        input.frequency,
        input.frequency_days ?? null,
        input.frequency_time,
        input.selected_days ?? ['monday'],
        input.calls_per_day,
        input.max_attempts,
        input.retry_interval,
        input.company_id,
        input.number_id,
      ]
    );

    return res.rows[0];
  },

  /**
   * Find schedule by id, optionally scoped to tenant
   */
  async find(
    id: number,
    companyId?: string
  ): Promise<ReassuranceCallSchedule | null> {
    const res = await pool.query<ReassuranceCallSchedule>(
      `
      SELECT *
      FROM reassurance_call_schedules
      WHERE id = $1
        ${companyId ? 'AND company_id = $2' : ''}
    `,
      companyId ? [id, companyId] : [id]
    );

    return res.rows[0] || null;
  },
  /**
   * Get all schedules for a given tenant
   */
  async getAll(companyId: string): Promise<ReassuranceCallSchedule[]> {
    const res = await pool.query<ReassuranceCallSchedule>(
      `
      SELECT *
      FROM reassurance_call_schedules
      WHERE company_id = $1
      ORDER BY created_at DESC
      `,
      [companyId]
    );

    return res.rows;
  },

  /**
   * Delete schedule scoped to tenant
   */
  async delete(id: number, companyId: string): Promise<void> {
    await pool.query(
      `
      DELETE FROM reassurance_call_schedules
      WHERE id = $1
        AND company_id = $2
      `,
      [id, companyId]
    );
  },

  /**
   * Update schedule scoped to tenant
   */
  async update(
    input: UpdateScheduleInput,
    client?: PoolClient
  ): Promise<ReassuranceCallSchedule> {
    const db = client ?? pool;

    const res = await db.query<ReassuranceCallSchedule>(
      `
      UPDATE reassurance_call_schedules
      SET
        name = $2,
        caller_name = $3,

        script_type = $4,
        template = $5,
        script_content = $6,
        name_in_script = $7,

        frequency = $8,
        frequency_days = $9,
        frequency_time = $10,

        selected_days = $11,

        calls_per_day = $12,
        max_attempts = $13,
        retry_interval = $14,

        is_active = $15,

        emergency_contact_name = $16,
        emergency_contact_phone_number = $17

      WHERE id = $1
      RETURNING *
      `,
      [
        input.id,
        input.name,
        input.caller_name ?? null,

        input.script_type,
        input.template ?? null,
        input.script_content ?? null,
        input.name_in_script,

        input.frequency,
        input.frequency_days ?? null,
        input.frequency_time,

        input.selected_days ? JSON.stringify(input.selected_days) : null,

        input.calls_per_day,
        input.max_attempts,
        input.retry_interval,

        input.is_active ?? true,

        input.emergency_contact_name ?? null,
        input.emergency_contact_phone_number ?? null,
      ]
    );

    return res.rows[0];
  },

  /**
   * Paginated call logs for reassurance schedules
   * Only returns calls for schedules that belong to the given tenant (companyId)
   */
  async getPaginatedScheduleCallLogs({
    page = 1,
    pageSize = 20,
    companyId,
  }: {
    page?: number;
    pageSize?: number;
    companyId: string;
  }): Promise<{
    data: ScheduleCallLogRow[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const where = `WHERE s.company_id = $1`;
    const params: any[] = [companyId];

    // --- Total count (no need to join numbers here) ---
    const countRes = await pool.query<{ total: string }>(
      `
    SELECT COUNT(*) AS total
    FROM calls c
    JOIN reassurance_call_schedules s
      ON (c.meta::jsonb->>'scheduleId') = s.id::text
    ${where}
    `,
      params
    );

    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    // --- Paginated data with schedule + number ---
    const dataQueryParams = [...params, limit, offset]; // $1 = companyId, $2 = limit, $3 = offset

    const dataRes = await pool.query<ScheduleCallLogRow>(
      `
    SELECT
      c.*,
      row_to_json(s) AS schedule,
      row_to_json(n) AS number
    FROM calls c
    JOIN reassurance_call_schedules s
      ON (c.meta::jsonb->>'scheduleId') = s.id::text
    JOIN numbers n
      ON c.number_id = n.id
    ${where}
    ORDER BY c.initiated_at DESC
    LIMIT $2 OFFSET $3
    `,
      dataQueryParams
    );

    return {
      data: dataRes.rows,
      page,
      pageSize: limit,
      total,
    };
  },

  /**
   * Find active schedules (optionally batched)
   * Used by cron to seed upcoming jobs.
   */
  async findActive({
    limit = 500,
    offset = 0,
    companyId,
  }: {
    limit?: number;
    offset?: number;
    companyId?: string;
  }): Promise<ReassuranceCallSchedule[]> {
    const params: any[] = [limit, offset];
    const companyClause = companyId ? `AND company_id = $3` : '';

    if (companyId) params.push(companyId);

    const res = await pool.query<ReassuranceCallSchedule>(
      `
      SELECT *
      FROM reassurance_call_schedules
      WHERE is_active = true
      ${companyClause}
      ORDER BY id ASC
      LIMIT $1 OFFSET $2
      `,
      params
    );

    return res.rows;
  },
  async findByContactId(
    contactId: string,
    companyId?: string
  ): Promise<ReassuranceCallSchedule | null> {
    const res = await pool.query<ReassuranceCallSchedule>(
      `
      SELECT s.*
      FROM reassurance_call_schedules s
      JOIN contacts c
        ON c.company_id = s.company_id
       AND c.number = s.phone_number
      WHERE c.id = $1
        ${companyId ? 'AND s.company_id = $2' : ''}
      ORDER BY s.created_at DESC NULLS LAST, s.id DESC
      LIMIT 1
      `,
      companyId ? [contactId, companyId] : [contactId]
    );

    return res.rows[0] || null;
  },
};
