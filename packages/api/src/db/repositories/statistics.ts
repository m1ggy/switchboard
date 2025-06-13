import pool from '@/lib/pg';
import { Contact } from '@/types/db';

async function getUserCompanyIds(userId: string): Promise<string[]> {
  const res = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM user_companies WHERE user_id = $1`,
    [userId]
  );
  return res.rows.map((row) => row.company_id);
}

export const StatisticsRepository = {
  // --------------------------
  // 📞 CALL STATISTICS
  // --------------------------

  async getWeeklyCallCount(userId: string): Promise<number> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM calls
       JOIN contacts ON calls.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       AND calls.initiated_at >= date_trunc('week', now())`,
      [companyIds]
    );
    return parseInt(res.rows[0].count, 10);
  },

  async getWeeklyCallDuration(userId: string): Promise<number> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query<{ sum: string | null }>(
      `SELECT SUM(duration) FROM calls
       JOIN contacts ON calls.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       AND calls.initiated_at >= date_trunc('week', now())`,
      [companyIds]
    );
    return parseInt(res.rows[0].sum ?? '0', 10);
  },

  async getAvgCallDurationThisWeek(userId: string): Promise<number> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query<{ avg: string | null }>(
      `SELECT AVG(duration) FROM calls
       JOIN contacts ON calls.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       AND calls.initiated_at >= date_trunc('week', now())`,
      [companyIds]
    );
    return parseFloat(res.rows[0].avg ?? '0');
  },

  async getLongestCallThisWeek(userId: string): Promise<number> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query<{ max: string | null }>(
      `SELECT MAX(duration) FROM calls
       JOIN contacts ON calls.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       AND calls.initiated_at >= date_trunc('week', now())`,
      [companyIds]
    );
    return parseInt(res.rows[0].max ?? '0', 10);
  },

  async getTopContactsByCallCount(
    userId: string,
    limit = 5
  ): Promise<(Contact & { call_count: number })[]> {
    const companyIds = await getUserCompanyIds(userId);

    const res = await pool.query(
      `SELECT
       contacts.id,
       contacts.number,
       contacts.label,
       contacts.created_at,
       contacts.company_id,
       COUNT(*) as call_count
     FROM calls
     JOIN contacts ON calls.contact_id = contacts.id
     WHERE contacts.company_id = ANY($1)
     GROUP BY contacts.id
     ORDER BY call_count DESC
     LIMIT $2`,
      [companyIds, limit]
    );

    return res.rows.map((row) => ({
      id: row.id,
      number: row.number,
      label: row.label,
      created_at: row.created_at,
      company_id: row.company_id,
      call_count: parseInt(row.call_count, 10),
    }));
  },

  async getWeeklyCallSIDs(userId: string): Promise<string[]> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query<{ call_sid: string }>(
      `SELECT calls.call_sid
       FROM calls
       JOIN contacts ON calls.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       AND calls.initiated_at >= date_trunc('week', now())
       AND calls.call_sid IS NOT NULL`,
      [companyIds]
    );
    return res.rows.map((r) => r.call_sid);
  },

  // --------------------------
  // ✉️ MESSAGE STATISTICS
  // --------------------------

  async getWeeklySMSCount(
    userId: string
  ): Promise<{ inbound: number; outbound: number }> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query<{ direction: string; count: string }>(
      `SELECT messages.direction, COUNT(*) 
       FROM messages
       JOIN contacts ON messages.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       AND messages.created_at >= date_trunc('week', now())
       GROUP BY messages.direction`,
      [companyIds]
    );

    const summary = { inbound: 0, outbound: 0 };
    for (const row of res.rows) {
      summary[row.direction as 'inbound' | 'outbound'] = parseInt(
        row.count,
        10
      );
    }
    return summary;
  },

  async getDailyMessageVolumeTrend(
    userId: string
  ): Promise<{ date: string; count: number }[]> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query(
      `SELECT DATE(messages.created_at) as date, COUNT(*) as count
       FROM messages
       JOIN contacts ON messages.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       AND messages.created_at >= now() - INTERVAL '7 days'
       GROUP BY date
       ORDER BY date ASC`,
      [companyIds]
    );
    return res.rows.map((r) => ({
      date: r.date,
      count: parseInt(r.count, 10),
    }));
  },

  async getTopMessageContact(
    userId: string
  ): Promise<{ contact_id: string; total_messages: number } | null> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query(
      `SELECT messages.contact_id, COUNT(*) as total_messages
       FROM messages
       JOIN contacts ON messages.contact_id = contacts.id
       WHERE contacts.company_id = ANY($1)
       GROUP BY messages.contact_id
       ORDER BY total_messages DESC
       LIMIT 1`,
      [companyIds]
    );
    if (res.rows.length === 0) return null;
    return {
      contact_id: res.rows[0].contact_id,
      total_messages: parseInt(res.rows[0].total_messages, 10),
    };
  },

  // --------------------------
  // 👤 CONTACT & COMPANY STATS
  // --------------------------

  async getNewContactsThisWeek(userId: string): Promise<number> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM contacts
       WHERE contacts.company_id = ANY($1)
       AND contacts.created_at >= date_trunc('week', now())`,
      [companyIds]
    );
    return parseInt(res.rows[0].count, 10);
  },

  async getMostEngagedContact(
    userId: string
  ): Promise<{ contact_id: string; total_interactions: number } | null> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query(
      `SELECT contact_id, COUNT(*) as total_interactions FROM (
         SELECT calls.contact_id
         FROM calls
         JOIN contacts ON calls.contact_id = contacts.id
         WHERE contacts.company_id = ANY($1)
         UNION ALL
         SELECT messages.contact_id
         FROM messages
         JOIN contacts ON messages.contact_id = contacts.id
         WHERE contacts.company_id = ANY($1)
       ) AS combined
       GROUP BY contact_id
       ORDER BY total_interactions DESC
       LIMIT 1`,
      [companyIds]
    );
    if (res.rows.length === 0) return null;
    return {
      contact_id: res.rows[0].contact_id,
      total_interactions: parseInt(res.rows[0].total_interactions, 10),
    };
  },

  async getMostActiveCompany(
    userId: string
  ): Promise<{ company_id: string; total_activity: number } | null> {
    const companyIds = await getUserCompanyIds(userId);
    const res = await pool.query(
      `SELECT company_id, COUNT(*) as total_activity FROM (
         SELECT contacts.company_id
         FROM calls
         JOIN contacts ON calls.contact_id = contacts.id
         WHERE contacts.company_id = ANY($1)
         UNION ALL
         SELECT contacts.company_id
         FROM messages
         JOIN contacts ON messages.contact_id = contacts.id
         WHERE contacts.company_id = ANY($1)
       ) AS combined
       GROUP BY company_id
       ORDER BY total_activity DESC
       LIMIT 1`,
      [companyIds]
    );
    if (res.rows.length === 0) return null;
    return {
      company_id: res.rows[0].company_id,
      total_activity: parseInt(res.rows[0].total_activity, 10),
    };
  },
  async getWeeklyChartData(
    userId: string
  ): Promise<{ date: string; calls: number; sms: number }[]> {
    const companyIds = await getUserCompanyIds(userId);

    // Aggregate calls by weekday
    const callsRes = await pool.query<{
      day: string;
      total: string;
    }>(
      `SELECT TO_CHAR(calls.initiated_at, 'Dy') AS day, COUNT(*) AS total
     FROM calls
     JOIN contacts ON calls.contact_id = contacts.id
     WHERE contacts.company_id = ANY($1)
     AND calls.initiated_at >= date_trunc('week', now())
     GROUP BY day`,
      [companyIds]
    );

    // Aggregate messages by weekday
    const smsRes = await pool.query<{
      day: string;
      total: string;
    }>(
      `SELECT TO_CHAR(messages.created_at, 'Dy') AS day, COUNT(*) AS total
     FROM messages
     JOIN contacts ON messages.contact_id = contacts.id
     WHERE contacts.company_id = ANY($1)
     AND messages.created_at >= date_trunc('week', now())
     GROUP BY day`,
      [companyIds]
    );

    // Initialize map with all days (Mon–Sun)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dataMap: Record<string, { calls: number; sms: number }> =
      Object.fromEntries(days.map((day) => [day, { calls: 0, sms: 0 }]));

    for (const row of callsRes.rows) {
      const day = row.day.slice(0, 3); // Normalize to Mon, Tue, ...
      if (dataMap[day]) dataMap[day].calls = parseInt(row.total, 10);
    }

    for (const row of smsRes.rows) {
      const day = row.day.slice(0, 3);
      if (dataMap[day]) dataMap[day].sms = parseInt(row.total, 10);
    }

    // Return in proper order
    return days.map((day) => ({
      date: day,
      calls: dataMap[day].calls,
      sms: dataMap[day].sms,
    }));
  },
  async getCompanyTableSummary(userId: string): Promise<
    {
      id: string;
      name: string;
      phone: string | null;
      calls: number;
      sms: number;
      active: boolean;
    }[]
  > {
    const res = await pool.query(
      `
    WITH companies_for_user AS (
      SELECT c.id, c.name
      FROM companies c
      JOIN user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = $1
    ),
    numbers_per_company AS (
      SELECT DISTINCT ON (company_id) company_id, number
      FROM numbers
      ORDER BY company_id, created_at DESC
    ),
    calls_today AS (
      SELECT contacts.company_id, COUNT(*) AS count
      FROM calls
      JOIN contacts ON contacts.id = calls.contact_id
      WHERE calls.initiated_at >= date_trunc('day', now())
      GROUP BY contacts.company_id
    ),
    sms_today AS (
      SELECT contacts.company_id, COUNT(*) AS count
      FROM messages
      JOIN contacts ON contacts.id = messages.contact_id
      WHERE messages.created_at >= date_trunc('day', now())
      GROUP BY contacts.company_id
    ),
    active_flags AS (
      SELECT company_id, BOOL_OR(u.is_active) as active
      FROM user_companies uc
      JOIN users u ON uc.user_id = u.user_id
      GROUP BY company_id
    )

    SELECT 
      c.id,
      c.name,
      n.number AS phone,
      COALESCE(ct.count, 0) AS calls,
      COALESCE(st.count, 0) AS sms,
      COALESCE(a.active, false) AS active
    FROM companies_for_user c
    LEFT JOIN numbers_per_company n ON c.id = n.company_id
    LEFT JOIN calls_today ct ON c.id = ct.company_id
    LEFT JOIN sms_today st ON c.id = st.company_id
    LEFT JOIN active_flags a ON c.id = a.company_id
    ORDER BY c.name
    `,
      [userId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      calls: parseInt(row.calls, 10),
      sms: parseInt(row.sms, 10),
      active: row.active,
    }));
  },
};
