import pool from '@/lib/pg';
import { ReassuranceContactMemorySummary } from '@/types/db';
export const ReassuranceContactMemorySummaryRepository = {
  async getByContactId(
    contactId: string
  ): Promise<ReassuranceContactMemorySummary | null> {
    const res = await pool.query<ReassuranceContactMemorySummary>(
      `
      SELECT *
      FROM reassurance_contact_memory_summary
      WHERE contact_id = $1
      `,
      [contactId]
    );
    return res.rows[0] || null;
  },

  /**
   * Upsert the rolling memory summary for a contact.
   * Usually called after each call, once you've generated a new summary_text.
   */
  async upsertSummary({
    contact_id,
    summary_text,
  }: {
    contact_id: string;
    summary_text: string;
  }): Promise<ReassuranceContactMemorySummary> {
    const res = await pool.query<ReassuranceContactMemorySummary>(
      `
      INSERT INTO reassurance_contact_memory_summary (
        contact_id,
        summary_text,
        last_updated_at
      )
      VALUES ($1, $2, NOW())
      ON CONFLICT (contact_id)
      DO UPDATE SET
        summary_text = EXCLUDED.summary_text,
        last_updated_at = EXCLUDED.last_updated_at
      RETURNING *
      `,
      [contact_id, summary_text]
    );

    return res.rows[0];
  },
};
