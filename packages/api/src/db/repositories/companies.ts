import pool from '@/lib/pg';
import { NumberEntry } from '@/types/db';

interface Company {
  id: string;
  name: string;
}

interface UserCompany {
  id: string;
  user_id: string;
  company_id: string;
  name: string;
}

export const UserCompaniesRepository = {
  async findByUserAndCompany({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<UserCompany | null> {
    const res = await pool.query<UserCompany>(
      `SELECT * FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [userId, companyId]
    );

    return res.rows[0] ?? null;
  },

  async create({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<UserCompany> {
    const res = await pool.query<UserCompany>(
      `INSERT INTO user_companies (id, user_id, company_id)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING *`,
      [userId, companyId]
    );

    return res.rows[0];
  },

  async findOrCreate({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<UserCompany> {
    const existing = await this.findByUserAndCompany({ userId, companyId });

    if (existing) return existing;

    return this.create({ userId, companyId });
  },

  async findCompaniesByUserId(
    userId: string
  ): Promise<(Company & { numbers: NumberEntry[] })[]> {
    const res = await pool.query(
      `
    SELECT 
      c.*, 
      COALESCE(json_agg(
        jsonb_build_object(
          'id', n.id,
          'number', n.number,
          'label', n.label,
          'created_at', n.created_at
        )
      ) FILTER (WHERE n.id IS NOT NULL), '[]') AS numbers
    FROM companies c
    JOIN user_companies uc ON c.id = uc.company_id
    LEFT JOIN numbers n ON c.id = n.company_id
    WHERE uc.user_id = $1
    GROUP BY c.id
    `,
      [userId]
    );

    return res.rows as (Company & { numbers: NumberEntry[] })[];
  },
  async findCompanyById(id: string): Promise<UserCompany | null> {
    const res = await pool.query<UserCompany>(
      `SELECT * FROM companies WHERE company_id = $1`,
      [id]
    );
    return res.rows?.[0] || null;
  },
};
