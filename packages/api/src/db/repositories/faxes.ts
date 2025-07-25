import pool from '@/lib/pg';
import { Contact, Fax } from '@/types/db';

export const FaxesRepository = {
  /**
   * Create a new fax record
   */
  async create({
    id,
    number_id,
    contact_id,
    direction,
    status = 'queued',
    initiated_at = new Date(),
    media_url,
    pages,
    fax_id,
    meta,
  }: {
    id: string;
    number_id: string;
    contact_id: string;
    direction: 'inbound' | 'outbound';
    status?: string;
    initiated_at?: Date;
    media_url?: string;
    pages?: number;
    fax_id?: string;
    meta?: Record<string, unknown>;
  }): Promise<Fax> {
    const res = await pool.query<Fax>(
      `INSERT INTO faxes (
         id, number_id, contact_id, direction, status,
         initiated_at, pages, media_url, fax_id, meta
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10
       ) RETURNING *`,
      [
        id,
        number_id,
        contact_id,
        direction,
        status,
        initiated_at.toISOString(),
        pages ?? null,
        media_url ?? null,
        fax_id ?? null,
        meta ?? null,
      ]
    );
    return res.rows[0];
  },

  /**
   * Get recent faxes for a contact
   */
  async findByContact(contactId: string, limit = 10): Promise<Fax[]> {
    const res = await pool.query<Fax>(
      `SELECT * FROM faxes
       WHERE contact_id = $1
       ORDER BY initiated_at DESC
       LIMIT $2`,
      [contactId, limit]
    );
    return res.rows;
  },

  /**
   * Get faxes for a number
   */
  async findByNumber(numberId: string): Promise<Fax[]> {
    const res = await pool.query<Fax>(
      `SELECT * FROM faxes
       WHERE number_id = $1
       ORDER BY initiated_at DESC`,
      [numberId]
    );
    return res.rows;
  },

  /**
   * Get faxes for a number including contact
   */
  async findByNumberWithContact(
    numberId: string
  ): Promise<(Fax & { contact: Contact })[]> {
    const res = await pool.query(
      `
      SELECT 
        faxes.*,
        jsonb_build_object(
          'id', contacts.id,
          'number', contacts.number,
          'created_at', contacts.created_at,
          'company_id', contacts.company_id,
          'label', contacts.label
        ) AS contact
      FROM faxes
      JOIN contacts ON faxes.contact_id = contacts.id
      WHERE faxes.number_id = $1
      ORDER BY faxes.initiated_at DESC
    `,
      [numberId]
    );

    return res.rows.map((row) => ({
      ...row,
      contact: row.contact,
    }));
  },

  /**
   * Find by fax_id
   */
  async findByFaxId(fax_id: string): Promise<Fax | null> {
    const res = await pool.query<Fax>(`SELECT * FROM faxes WHERE fax_id = $1`, [
      fax_id,
    ]);
    return res.rows[0] || null;
  },

  /**
   * Delete by ID
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM faxes WHERE id = $1`, [id]);
  },

  /**
   * Update by fax_id
   */
  async update(fax_id: string, updates: Partial<Fax>): Promise<Fax | null> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('No fields provided to update.');
    }

    values.push(fax_id);

    const res = await pool.query<Fax>(
      `UPDATE faxes SET ${fields.join(', ')} WHERE fax_id = $${paramIndex} RETURNING *`,
      values
    );

    return res.rows[0] || null;
  },
};
