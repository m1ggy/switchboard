// src/db/repositories/reassurance_contact_profiles.ts
import pool from '@/lib/pg';
import type { PoolClient } from 'pg';

export interface ReassuranceContactProfile {
  contact_id: string;
  preferred_name: string | null;
  locale: string | null;
  timezone: string | null;
  demographics: any | null; // jsonb
  medical_notes: string | null;
  preferences: any | null; // jsonb
  goals: string | null;
  risk_flags: any | null; // jsonb
  last_state: any | null; // jsonb
  updated_at: string; // timestamptz
}

export const ReassuranceContactProfilesRepository = {
  async getByContactId(
    contactId: string
  ): Promise<ReassuranceContactProfile | null> {
    const res = await pool.query<ReassuranceContactProfile>(
      `
      SELECT *
      FROM reassurance_contact_profiles
      WHERE contact_id = $1
      `,
      [contactId]
    );
    return res.rows[0] || null;
  },

  async upsert(
    {
      contact_id,
      preferred_name,
      locale,
      timezone,
      demographics,
      medical_notes,
      preferences,
      goals,
      risk_flags,
      last_state,
    }: any,
    db: PoolClient | typeof pool = pool
  ) {
    const res = await db.query(
      `
      INSERT INTO reassurance_contact_profiles (
        contact_id,
        preferred_name,
        locale,
        timezone,
        demographics,
        medical_notes,
        preferences,
        goals,
        risk_flags,
        last_state,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
      ON CONFLICT (contact_id)
      DO UPDATE SET
        preferred_name = COALESCE(EXCLUDED.preferred_name, reassurance_contact_profiles.preferred_name),
        locale = COALESCE(EXCLUDED.locale, reassurance_contact_profiles.locale),
        timezone = COALESCE(EXCLUDED.timezone, reassurance_contact_profiles.timezone),
        demographics = COALESCE(EXCLUDED.demographics, reassurance_contact_profiles.demographics),
        medical_notes = COALESCE(EXCLUDED.medical_notes, reassurance_contact_profiles.medical_notes),
        preferences = COALESCE(EXCLUDED.preferences, reassurance_contact_profiles.preferences),
        goals = COALESCE(EXCLUDED.goals, reassurance_contact_profiles.goals),
        risk_flags = COALESCE(EXCLUDED.risk_flags, reassurance_contact_profiles.risk_flags),
        last_state = COALESCE(EXCLUDED.last_state, reassurance_contact_profiles.last_state),
        updated_at = NOW()
      RETURNING *
      `,
      [
        contact_id,
        preferred_name ?? null,
        locale ?? null,
        timezone ?? null,
        demographics ?? null,
        medical_notes ?? null,
        preferences ?? null,
        goals ?? null,
        risk_flags ?? null,
        last_state ?? null,
      ]
    );

    return res.rows[0];
  },
  /**
   * Patch-style update: only update provided keys.
   * For json fields: pass entire object (replace), or use updateJsonMerge if you want merge semantics.
   */
  async update(
    contactId: string,
    updates: Partial<
      Omit<ReassuranceContactProfile, 'contact_id' | 'updated_at'>
    >
  ): Promise<ReassuranceContactProfile | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      fields.push(`${key} = $${i}`);
      values.push(value);
      i++;
    }

    if (!fields.length) throw new Error('No fields provided to update.');

    values.push(contactId);

    const res = await pool.query<ReassuranceContactProfile>(
      `
      UPDATE reassurance_contact_profiles
      SET ${fields.join(', ')},
          updated_at = NOW()
      WHERE contact_id = $${i}
      RETURNING *
      `,
      values
    );

    return res.rows[0] || null;
  },

  /**
   * Merge into last_state (jsonb) without overwriting other keys.
   */
  async mergeLastState(contactId: string, patch: Record<string, any>) {
    const res = await pool.query<ReassuranceContactProfile>(
      `
      UPDATE reassurance_contact_profiles
      SET last_state = COALESCE(last_state, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE contact_id = $1
      RETURNING *
      `,
      [contactId, JSON.stringify(patch)]
    );
    return res.rows[0] || null;
  },

  /**
   * Merge into risk_flags (jsonb) without overwriting other keys.
   */
  async mergeRiskFlags(contactId: string, patch: Record<string, any>) {
    const res = await pool.query<ReassuranceContactProfile>(
      `
      UPDATE reassurance_contact_profiles
      SET risk_flags = COALESCE(risk_flags, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE contact_id = $1
      RETURNING *
      `,
      [contactId, JSON.stringify(patch)]
    );
    return res.rows[0] || null;
  },

  async getAllByCompanyId(
    companyId: string,
    db: PoolClient | typeof pool = pool
  ) {
    const res = await db.query(
      `
    SELECT
      p.*,
      row_to_json(c) AS contact
    FROM contacts c
    INNER JOIN reassurance_contact_profiles p
      ON p.contact_id = c.id
    WHERE c.company_id = $1
    ORDER BY c.created_at DESC
    `,
      [companyId]
    );

    return res.rows;
  },
  async getAllWithSchedulesByCompanyId(
    companyId: string,
    db: PoolClient | typeof pool = pool
  ) {
    const res = await db.query(
      `
    SELECT
      row_to_json(c) AS contact,
      row_to_json(p) AS profile,
      COALESCE(
        json_agg(s ORDER BY s.created_at DESC)
          FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS schedules
    FROM contacts c
    INNER JOIN reassurance_contact_profiles p
      ON p.contact_id = c.id
    LEFT JOIN reassurance_call_schedules s
      ON s.phone_number = c.number
     AND s.company_id = c.company_id
    WHERE c.company_id = $1
    GROUP BY c.id, p.contact_id
    ORDER BY c.created_at DESC
    `,
      [companyId]
    );

    return res.rows;
  },
};
