import pool from '@/lib/pg';
import { ReassuranceCallSchedule } from '@/types/db';

export const ReassuranceSchedulesRepository = {
  async include({
    name,
    phone_number,
    caller_name,
    // NEW:
    emergency_contact_name,
    emergency_contact_phone_number,
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
    number_id,
  }: {
    name: string;
    phone_number: string; // callee
    caller_name?: string | null;
    // NEW:
    emergency_contact_name?: string | null;
    emergency_contact_phone_number?: string | null;
    script_type: 'template' | 'custom';
    template?: string | null;
    script_content?: string | null;
    name_in_script: 'contact' | 'caller';
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
    frequency_days?: number | null;
    frequency_time: string; // 'HH:MM'
    selected_days?: string[] | null;
    calls_per_day: number;
    max_attempts: number;
    retry_interval: number; // minutes
    company_id: string; // uuid (tenant id)
    number_id: string; // uuid (FK to numbers.id)
  }): Promise<ReassuranceCallSchedule> {
    const res = await pool.query<ReassuranceCallSchedule>(
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
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      RETURNING *
      `,
      [
        name, // $1
        phone_number, // $2
        emergency_contact_name ?? null, // $3
        emergency_contact_phone_number ?? null, // $4
        caller_name ?? null, // $5
        script_type, // $6
        template ?? null, // $7
        script_content ?? null, // $8
        name_in_script, // $9
        frequency, // $10
        frequency_days ?? null, // $11
        frequency_time, // $12
        selected_days ?? ['monday'], // $13
        calls_per_day, // $14
        max_attempts, // $15
        retry_interval, // $16
        company_id, // $17
        number_id, // $18
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
    id: number,
    companyId: string,
    updates: Partial<ReassuranceCallSchedule>
  ): Promise<ReassuranceCallSchedule | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      // Don't allow changing primary key, created_at, or company_id (tenant)
      if (key === 'id' || key === 'created_at' || key === 'company_id')
        continue;

      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('No fields provided to update.');
    }

    // Add id and companyId as the last params
    const idParamIndex = paramIndex;
    const companyIdParamIndex = paramIndex + 1;

    values.push(id); // $idParamIndex
    values.push(companyId); // $companyIdParamIndex

    const res = await pool.query<ReassuranceCallSchedule>(
      `
      UPDATE reassurance_call_schedules
      SET ${fields.join(', ')}
      WHERE id = $${idParamIndex}
        AND company_id = $${companyIdParamIndex}
      RETURNING *
      `,
      values
    );

    return res.rows[0] || null;
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
    companyId: string; // required uuid filter (tenant)
  }): Promise<{
    data: Call[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    // --- Where clause for required company filter ---
    const where = `WHERE s.company_id = $1`;
    const params: any[] = [companyId];

    // --- Total count query ---
    const countRes = await pool.query<{ total: string }>(
      `
      SELECT COUNT(*) AS total
      FROM calls c
      JOIN reassurance_call_schedules s
        ON (c.meta->>'scheduleId')::int = s.id
      ${where}
      `,
      params
    );

    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    // --- Paginated data query ---
    const dataQueryParams = [...params, limit, offset];
    // companyId = $1, limit = $2, offset = $3
    const dataRes = await pool.query<Call>(
      `
      SELECT c.*
      FROM calls c
      JOIN reassurance_call_schedules s
        ON (c.meta->>'scheduleId')::int = s.id
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
};
