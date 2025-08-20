import pool from '@/lib/pg';

export interface Voicemail {
  id: string;
  company_id: string;
  number_id: string | null;
  contact_id: string | null;
  call_id: string | null;
  call_sid: string | null;
  from_number: string;
  to_number: string;
  recording_sid: string;
  recording_url: string;
  duration_secs: number;
  transcription_text: string | null;
  transcription_status: 'pending' | 'completed' | 'failed' | null;
  read_at: string | null; // ISO string
  created_at: string; // ISO string
}

type CreateVoicemailInput = {
  companyId: string;
  numberId?: string | null;
  contactId?: string | null;
  callId?: string | null;
  callSid?: string | null;
  from: string;
  to: string;
  recordingSid: string;
  recordingUrl: string; // e.g. https://api.twilio.com/.../Recordings/RE123.mp3
  durationSecs: number;
  transcriptionText?: string | null;
  transcriptionStatus?: 'pending' | 'completed' | 'failed' | null;
};

export const VoicemailsRepository = {
  async create(input: CreateVoicemailInput): Promise<Voicemail> {
    const res = await pool.query<Voicemail>(
      `
      INSERT INTO voicemails (
        id, company_id, number_id, contact_id, call_id, call_sid,
        from_number, to_number, recording_sid, recording_url, duration_secs,
        transcription_text, transcription_status
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12
      )
      RETURNING *;
      `,
      [
        input.companyId,
        input.numberId ?? null,
        input.contactId ?? null,
        input.callId ?? null,
        input.callSid ?? null,
        input.from,
        input.to,
        input.recordingSid,
        input.recordingUrl,
        input.durationSecs,
        input.transcriptionText ?? null,
        input.transcriptionStatus ?? null,
      ]
    );

    return res.rows[0];
  },

  async findById(id: string): Promise<Voicemail | null> {
    const res = await pool.query<Voicemail>(
      `SELECT * FROM voicemails WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  },

  async findByCallSid(callSid: string): Promise<Voicemail | null> {
    const res = await pool.query<Voicemail>(
      `SELECT * FROM voicemails WHERE call_sid = $1 ORDER BY created_at DESC LIMIT 1`,
      [callSid]
    );
    return res.rows[0] ?? null;
  },

  async listByCompany(
    companyId: string,
    opts?: { limit?: number; offset?: number; unreadOnly?: boolean }
  ): Promise<Voicemail[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const unreadClause = opts?.unreadOnly ? 'AND read_at IS NULL' : '';

    const res = await pool.query<Voicemail>(
      `
      SELECT * FROM voicemails
      WHERE company_id = $1
      ${unreadClause}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [companyId, limit, offset]
    );
    return res.rows;
  },

  async listByNumber(
    numberId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<Voicemail[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const res = await pool.query<Voicemail>(
      `
      SELECT * FROM voicemails
      WHERE number_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [numberId, limit, offset]
    );
    return res.rows;
  },

  async markRead(id: string): Promise<Voicemail | null> {
    const res = await pool.query<Voicemail>(
      `
      UPDATE voicemails
      SET read_at = NOW()
      WHERE id = $1
      RETURNING *;
      `,
      [id]
    );
    return res.rows[0] ?? null;
  },

  async setTranscription(
    id: string,
    data: { text: string; status?: 'completed' | 'failed' }
  ): Promise<Voicemail | null> {
    const res = await pool.query<Voicemail>(
      `
      UPDATE voicemails
      SET transcription_text = $2,
          transcription_status = COALESCE($3, transcription_status)
      WHERE id = $1
      RETURNING *;
      `,
      [id, data.text, data.status ?? null]
    );
    return res.rows[0] ?? null;
  },

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM voicemails WHERE id = $1`, [id]);
  },

  async unreadCountByCompany(companyId: string): Promise<number> {
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM voicemails WHERE company_id = $1 AND read_at IS NULL`,
      [companyId]
    );
    return Number(res.rows[0]?.count ?? 0);
  },
};
