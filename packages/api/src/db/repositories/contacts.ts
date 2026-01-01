import pool from '@/lib/pg';
import { Contact } from '@/types/db';
import crypto from 'crypto';
import type { PoolClient } from 'pg';

export const ContactsRepository = {
  async create(
    {
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
    },
    db: PoolClient | typeof pool = pool
  ): Promise<Contact> {
    const existing = await db.query<Contact>(
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

    const res = await db.query<Contact>(
      `INSERT INTO contacts (
        id, number, company_id, created_at, label
      ) VALUES (
        $1, $2, $3, $4, $5
      ) RETURNING *`,
      [id, number, company_id, created_at || new Date(), label]
    );

    return res.rows[0];
  },

  async findByNumber(
    number: string,
    companyId?: string,
    db: PoolClient | typeof pool = pool
  ): Promise<Contact | null> {
    const res = await db.query<Contact>(
      `SELECT * FROM contacts
       WHERE number = $1 ${companyId ? 'AND company_id = $2' : ''}
       LIMIT 1`,
      companyId ? [number, companyId] : [number]
    );

    return res.rows[0] || null;
  },

  async findOrCreate(
    {
      number,
      companyId,
      label,
    }: {
      number: string;
      companyId: string;
      label?: string;
    },
    db: PoolClient | typeof pool = pool
  ): Promise<Contact> {
    const existing = await this.findByNumber(number, companyId, db);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const contactLabel = label || number;

    const res = await db.query<Contact>(
      `INSERT INTO contacts (
         id, number, company_id, created_at, label
       ) VALUES (
         $1, $2, $3, $4, $5
       ) RETURNING *`,
      [id, number, companyId, new Date(), contactLabel]
    );

    return res.rows[0];
  },

  async findById(
    id: string,
    db: PoolClient | typeof pool = pool
  ): Promise<Contact | null> {
    const res = await db.query<Contact>(
      `SELECT * FROM contacts WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async findByCompany(
    companyId: string,
    db: PoolClient | typeof pool = pool
  ): Promise<Contact[]> {
    const res = await db.query<Contact>(
      `SELECT *
       FROM contacts
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId]
    );
    return res.rows;
  },
};
