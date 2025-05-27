import pool from '@/lib/pg';
import { Contact } from '@/types/db';

export const ContactsRepository = {
  /**
   * Create a new contact
   */
  async create({
    id,
    number,
    company_id,
    created_at,
    label,
  }: {
    id: string;
    number: string;
    company_id: string;
    created_at?: Date;
    label: string;
  }): Promise<Contact> {
    // Check if a contact already exists with the same number OR label for the same company
    const existing = await pool.query<Contact>(
      `SELECT * FROM contacts
     WHERE company_id = $1
       AND (number = $2 OR label = $3)
     LIMIT 1`,
      [company_id, number, label]
    );

    if (existing.rows.length > 0) {
      throw new Error(
        'A contact with the same number or label already exists.'
      );
    }

    const res = await pool.query<Contact>(
      `INSERT INTO contacts (
       id, number, company_id, created_at, label
     ) VALUES (
       $1, $2, $3, $4, $5
     ) RETURNING *`,
      [id, number, company_id, created_at || new Date(), label]
    );

    return res.rows[0];
  },

  /**
   * Find a contact by ID
   */
  async findById(id: string): Promise<Contact | null> {
    const res = await pool.query<Contact>(
      `SELECT * FROM contacts WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  /**
   * Find a contact by number (and company, optional)
   */
  async findByNumber(
    number: string,
    companyId?: string
  ): Promise<Contact | null> {
    const res = await pool.query<Contact>(
      `SELECT * FROM contacts
       WHERE number = $1 ${companyId ? 'AND company_id = $2' : ''}
       LIMIT 1`,
      companyId ? [number, companyId] : [number]
    );

    return res.rows[0] || null;
  },

  /**
   * List all contacts for a company
   */
  async findByCompany(companyId: string): Promise<Contact[]> {
    const res = await pool.query<Contact>(
      `SELECT * FROM contacts
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId]
    );
    return res.rows;
  },

  /**
   * Delete a contact
   */
  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM contacts WHERE id = $1`, [id]);
  },

  /**
   * Update a contact's fields by ID
   */
  async update(id: string, updates: Partial<Contact>): Promise<Contact> {
    const fields = Object.keys(updates) as (keyof Contact)[];
    if (fields.length === 0) {
      throw new Error('No updates provided.');
    }

    // Optional: Ensure that number or label uniqueness is maintained
    if ((updates.number || updates.label) && updates.company_id) {
      const conflict = await pool.query<Contact>(
        `SELECT * FROM contacts
       WHERE company_id = $1
         AND id != $2
         AND (number = $3 OR label = $4)
       LIMIT 1`,
        [updates.company_id, id, updates.number || '', updates.label || '']
      );

      if (conflict.rows.length > 0) {
        throw new Error(
          'A contact with the same number or label already exists.'
        );
      }
    }

    // Dynamically build SET clause
    const setClauses = fields.map((field, index) => `${field} = $${index + 2}`);
    const values = fields.map((f) => updates[f]);

    const res = await pool.query<Contact>(
      `UPDATE contacts
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING *`,
      [id, ...values]
    );

    return res.rows[0];
  },
};
