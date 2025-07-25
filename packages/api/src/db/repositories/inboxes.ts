import pool from '@/lib/pg';
import { Inbox, InboxWithDetails } from '@/types/db';

export const InboxesRepository = {
  async findOrCreate({
    numberId,
    contactId,
  }: {
    numberId: string;
    contactId: string;
  }): Promise<Inbox> {
    const existing = await pool.query<Inbox>(
      `SELECT * FROM inboxes WHERE number_id = $1 AND contact_id = $2`,
      [numberId, contactId]
    );

    if (existing.rows[0]) return existing.rows[0];

    const res = await pool.query<Inbox>(
      `INSERT INTO inboxes (id, number_id, contact_id)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING *`,
      [numberId, contactId]
    );

    return res.rows[0];
  },

  async updateLastMessage(inboxId: string, messageId: string): Promise<void> {
    await pool.query(`UPDATE inboxes SET last_message_id = $1 WHERE id = $2`, [
      messageId,
      inboxId,
    ]);
  },

  async updateLastCall(inboxId: string, callId: string): Promise<void> {
    await pool.query(`UPDATE inboxes SET last_call_id = $1 WHERE id = $2`, [
      callId,
      inboxId,
    ]);
  },

  async findByNumberId(
    numberId: string
  ): Promise<(InboxWithDetails & { unreadCount: number })[]> {
    const result = await pool.query(
      `
    WITH unread_counts AS (
      SELECT 
        i.id AS inbox_id,
        COUNT(m.id) AS unread_count
      FROM inboxes i
      JOIN messages m ON
        m.contact_id = i.contact_id
        AND m.number_id = i.number_id
        AND (
          i.last_viewed_at IS NULL
          OR m.created_at > i.last_viewed_at
        )
      WHERE i.number_id = $1
      GROUP BY i.id
    )
    SELECT 
      i.id,
      i.number_id,
      i.contact_id,
      i.last_message_id,
      i.last_call_id,
      i.last_viewed_at,

      to_jsonb(c) AS contact,
      to_jsonb(lm) AS "lastMessage",
      to_jsonb(lc) AS "lastCall",

      COALESCE(uc.unread_count, 0) AS "unreadCount",

      GREATEST(
        COALESCE(lm.created_at, '1970-01-01'::timestamp),
        COALESCE(lc.initiated_at, '1970-01-01'::timestamp)
      ) AS latest_activity
    FROM inboxes i
    JOIN contacts c ON i.contact_id = c.id
    LEFT JOIN messages lm ON i.last_message_id = lm.id
    LEFT JOIN calls lc ON i.last_call_id = lc.id
    LEFT JOIN unread_counts uc ON i.id = uc.inbox_id
    WHERE i.number_id = $1
    ORDER BY latest_activity DESC
    `,
      [numberId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      numberId: row.number_id,
      contactId: row.contact_id,
      lastMessageId: row.last_message_id,
      lastCallId: row.last_call_id,
      contact: row.contact,
      lastMessage: row.lastMessage,
      lastCall: row.lastCall,
      lastViewedAt: row.last_viewed_at,
      unreadCount: Number(row.unreadCount),
    }));
  },
  async findActivityByContactPaginated(
    contactId: string,
    {
      limit = 50,
      cursorCreatedAt,
      cursorId,
    }: {
      limit?: number;
      cursorCreatedAt?: string;
      cursorId?: string;
    }
  ): Promise<
    {
      type: 'message' | 'call' | 'fax';
      id: string;
      numberId: string;
      createdAt: string;
      direction?: 'inbound' | 'outbound';
      message?: string;
      status?: 'sent' | 'draft';
      duration?: number;
      mediaUrl?: string;
      meta?: Record<string, string>;
      attachments?: {
        id: string;
        media_url: string;
        content_type: string;
        file_name: string | null;
      }[];
    }[]
  > {
    const result = await pool.query(
      `
    SELECT *
    FROM (
      -- messages
      SELECT
        'message' AS type,
        m.id,
        m.number_id AS "numberId",
        m.created_at AS "createdAt",
        m.direction::text AS direction,
        m.message,
        m.status::text AS status,
        NULL::integer AS duration,
        NULL::text AS "mediaUrl",
        m.meta
      FROM messages m
      WHERE m.contact_id = $1

      UNION ALL

      -- calls
      SELECT
        'call' AS type,
        c.id,
        c.number_id AS "numberId",
        c.initiated_at AS "createdAt",
        NULL::text AS direction,
        NULL::text AS message,
        NULL::text AS status,
        c.duration,
        NULL::text AS "mediaUrl",
        c.meta
      FROM calls c
      WHERE c.contact_id = $1

      UNION ALL

      -- faxes
      SELECT
        'fax' AS type,
        f.id,
        f.number_id AS "numberId",
        f.initiated_at AS "createdAt",
        f.direction::text AS direction,
        NULL::text AS message,
        f.status::text AS status,
        NULL::integer AS duration,
        f.media_url AS "mediaUrl",
        f.meta
      FROM faxes f
      WHERE f.contact_id = $1
    ) AS combined
    WHERE 
      ($2::timestamp IS NULL OR (
        "createdAt" < $2
        OR ("createdAt" = $2 AND id < $3)
      ))
    ORDER BY "createdAt" DESC, id DESC
    LIMIT $4
    `,
      [contactId, cursorCreatedAt || null, cursorId || null, limit]
    );

    const activity = result.rows;

    // Fetch attachments for messages only
    const messageIds = activity
      .filter((item) => item.type === 'message')
      .map((item) => item.id);

    let attachmentsByMessageId: Record<string, string[]> = {};

    if (messageIds.length > 0) {
      const res = await pool.query(
        `
      SELECT *
      FROM media_attachments
      WHERE message_id = ANY($1::uuid[])
      `,
        [messageIds]
      );

      attachmentsByMessageId = res.rows.reduce(
        (acc, row) => {
          if (!acc[row.message_id]) acc[row.message_id] = [];
          acc[row.message_id].push({
            id: row.id,
            media_url: row.media_url,
            content_type: row.content_type,
            file_name: row.file_name,
          });
          return acc;
        },
        {} as Record<string, string[]>
      );
    }

    return activity.map((item) => {
      if (item.type === 'message') {
        return {
          ...item,
          attachments: attachmentsByMessageId[item.id] ?? [],
        };
      }
      return item;
    });
  },
  async markInboxAsViewed(inboxId: string): Promise<void> {
    await pool.query(`UPDATE inboxes SET last_viewed_at = $1 WHERE id = $2`, [
      new Date(),
      inboxId,
    ]);
  },
  async findInboxesWithUnreadMessageCounts(
    numberId: string
  ): Promise<(InboxWithDetails & { unreadCount: number })[]> {
    const result = await pool.query(
      `
    WITH unread_counts AS (
      SELECT 
        i.id AS inbox_id,
        COUNT(m.id) AS unread_count
      FROM inboxes i
      JOIN messages m ON
        m.contact_id = i.contact_id
        AND m.number_id = i.number_id
        AND (
          i.last_viewed_at IS NULL
          OR m.created_at > i.last_viewed_at
        )
      WHERE i.number_id = $1
      GROUP BY i.id
      HAVING COUNT(m.id) > 0
    )
    SELECT 
      i.id,
      i.number_id,
      i.contact_id,
      i.last_message_id,
      i.last_call_id,
      i.last_viewed_at,

      to_jsonb(c) AS contact,
      to_jsonb(lm) AS "lastMessage",
      to_jsonb(lc) AS "lastCall",

      uc.unread_count AS "unreadCount"
    FROM unread_counts uc
    JOIN inboxes i ON i.id = uc.inbox_id
    JOIN contacts c ON i.contact_id = c.id
    LEFT JOIN messages lm ON i.last_message_id = lm.id
    LEFT JOIN calls lc ON i.last_call_id = lc.id
    ORDER BY uc.unread_count DESC
    `,
      [numberId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      numberId: row.number_id,
      contactId: row.contact_id,
      lastMessageId: row.last_message_id,
      lastCallId: row.last_call_id,
      contact: row.contact,
      lastMessage: row.lastMessage,
      lastCall: row.lastCall,
      lastViewedAt: row.last_viewed_at,
      unreadCount: Number(row.unreadCount),
    }));
  },

  async getUnreadCountForInbox(
    numberId: string,
    inboxId: string
  ): Promise<number> {
    const result = await pool.query(
      `
    SELECT COUNT(m.id) AS unread_count
    FROM inboxes i
    JOIN messages m ON
      m.contact_id = i.contact_id
      AND m.number_id = i.number_id
      AND (
        i.last_viewed_at IS NULL
        OR m.created_at > i.last_viewed_at
      )
    WHERE i.number_id = $1 AND i.id = $2
    GROUP BY i.id
    `,
      [numberId, inboxId]
    );

    return result.rowCount && result?.rowCount > 0
      ? Number(result.rows[0].unread_count)
      : 0;
  },
};
