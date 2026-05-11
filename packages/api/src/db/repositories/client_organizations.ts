import pool from '@/lib/pg';
import {
  ClientOrganization,
  ClientOrganizationContact,
  ClientOrganizationDashboardStats,
  ClientOrganizationLog,
} from '@/types/db';
import { Contact } from '@/types/db';
import type { PoolClient } from 'pg';

export const ClientOrganizationsRepository = {
  async findById(
    id: string,
    db: PoolClient | typeof pool = pool
  ): Promise<ClientOrganization | null> {
    const res = await db.query<ClientOrganization>(
      `SELECT * FROM client_organizations WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async findByUserId(
    userId: string,
    db: PoolClient | typeof pool = pool
  ): Promise<ClientOrganization | null> {
    const res = await db.query<ClientOrganization>(
      `SELECT co.* FROM client_organizations co
       JOIN client_organization_users cou ON cou.client_organization_id = co.id
       WHERE cou.user_id = $1 AND cou.is_active = true
       LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null;
  },

  async findByCompany(
    companyId: string,
    db: PoolClient | typeof pool = pool
  ): Promise<ClientOrganization[]> {
    const res = await db.query<ClientOrganization>(
      `SELECT * FROM client_organizations
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId]
    );
    return res.rows;
  },

  async getDashboardStats(
    clientOrganizationId: string,
    db: PoolClient | typeof pool = pool
  ): Promise<ClientOrganizationDashboardStats> {
    const res = await db.query<{
      total_contacts: string;
      total_members: string;
      total_calls: string;
      total_messages: string;
    }>(
      `SELECT
        (
          SELECT COUNT(*) FROM client_organization_contacts
          WHERE client_organization_id = $1 AND is_active = true
        ) AS total_contacts,
        (
          SELECT COUNT(*) FROM client_organization_users
          WHERE client_organization_id = $1 AND is_active = true
        ) AS total_members,
        (
          SELECT COUNT(*) FROM calls c
          JOIN client_organization_contacts coc ON coc.contact_id = c.contact_id
          WHERE coc.client_organization_id = $1 AND coc.is_active = true
        ) AS total_calls,
        (
          SELECT COUNT(*) FROM messages m
          JOIN client_organization_contacts coc ON coc.contact_id = m.contact_id
          WHERE coc.client_organization_id = $1 AND coc.is_active = true
        ) AS total_messages`,
      [clientOrganizationId]
    );

    const row = res.rows[0];
    return {
      total_contacts: parseInt(row.total_contacts, 10),
      total_members: parseInt(row.total_members, 10),
      total_calls: parseInt(row.total_calls, 10),
      total_messages: parseInt(row.total_messages, 10),
    };
  },

  async listContacts(
    clientOrganizationId: string,
    options: { limit?: number; offset?: number } = {},
    db: PoolClient | typeof pool = pool
  ): Promise<{ data: (Contact & { added_at: Date })[], total: number }> {
    const { limit = 20, offset = 0 } = options;

    const [dataRes, countRes] = await Promise.all([
      db.query<Contact & { added_at: Date }>(
        `SELECT
          con.*,
          coc.created_at AS added_at
        FROM client_organization_contacts coc
        JOIN contacts con ON coc.contact_id = con.id
        WHERE coc.client_organization_id = $1
          AND coc.is_active = true
        ORDER BY coc.created_at DESC
        LIMIT $2 OFFSET $3`,
        [clientOrganizationId, limit, offset]
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM client_organization_contacts
         WHERE client_organization_id = $1 AND is_active = true`,
        [clientOrganizationId]
      ),
    ]);

    return {
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].count, 10),
    };
  },

  async listLogs(
    clientOrganizationId: string,
    options: { limit?: number; offset?: number } = {},
    db: PoolClient | typeof pool = pool
  ): Promise<{ data: ClientOrganizationLog[]; total: number }> {
    const { limit = 20, offset = 0 } = options;

    const [dataRes, countRes] = await Promise.all([
      db.query<ClientOrganizationLog>(
        `SELECT * FROM (
          SELECT
            'call' AS type,
            c.id,
            c.contact_id,
            c.initiated_at AS created_at,
            c.duration,
            NULL::text AS message,
            NULL::text AS direction,
            c.meta
          FROM calls c
          JOIN client_organization_contacts coc ON coc.contact_id = c.contact_id
          WHERE coc.client_organization_id = $1 AND coc.is_active = true

          UNION ALL

          SELECT
            'message' AS type,
            m.id,
            m.contact_id,
            m.created_at,
            NULL::int AS duration,
            m.message,
            m.direction::text,
            m.meta
          FROM messages m
          JOIN client_organization_contacts coc ON coc.contact_id = m.contact_id
          WHERE coc.client_organization_id = $1 AND coc.is_active = true
        ) AS combined
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
        [clientOrganizationId, limit, offset]
      ),
      db.query<{ total: string }>(
        `SELECT
          (
            SELECT COUNT(*) FROM calls c
            JOIN client_organization_contacts coc ON coc.contact_id = c.contact_id
            WHERE coc.client_organization_id = $1 AND coc.is_active = true
          ) +
          (
            SELECT COUNT(*) FROM messages m
            JOIN client_organization_contacts coc ON coc.contact_id = m.contact_id
            WHERE coc.client_organization_id = $1 AND coc.is_active = true
          ) AS total`,
        [clientOrganizationId]
      ),
    ]);

    return {
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].total, 10),
    };
  },
};
