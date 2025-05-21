import pool from '@/lib/pg';

interface Company {
  id: string;
  name: string;
}

interface UserCompany {
  id: string;
  user_id: string;
  company_id: string;
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

  async findCompaniesByUserId(userId: string): Promise<Company[]> {
    const res = await pool.query<Company>(
      `
      SELECT c.*
      FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = $1
      `,
      [userId]
    );

    return res.rows;
  },
};
