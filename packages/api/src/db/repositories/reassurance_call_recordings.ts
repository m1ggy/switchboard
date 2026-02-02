import pool from '@/lib/pg';
import { ReassuranceCallRecording } from '@/types/db';

type CreateRecordingInput = {
  id?: string; // optional override; otherwise DB default gen_random_uuid()
  session_id: string;
  company_id: string;
  contact_id: string;

  call_sid?: string | null;
  stream_sid?: string | null;

  inbound_url?: string | null;
  outbound_url?: string | null;
  combined_url?: string | null;

  codec?: string; // default mulaw
  sample_rate?: number; // default 8000
  channels?: number; // default 1

  inbound_bytes?: number | null;
  outbound_bytes?: number | null;
  combined_bytes?: number | null;
  duration_ms?: number | null;

  meta?: any | null; // jsonb
};

type UpdateRecordingUrlsInput = {
  id: string;
  inbound_url?: string | null;
  outbound_url?: string | null;
  combined_url?: string | null;
  inbound_bytes?: number | null;
  outbound_bytes?: number | null;
  combined_bytes?: number | null;
  duration_ms?: number | null;
  meta?: any | null;
};

export const ReassuranceCallRecordingsRepository = {
  async create(input: CreateRecordingInput): Promise<ReassuranceCallRecording> {
    const res = await pool.query<ReassuranceCallRecording>(
      `
      INSERT INTO reassurance_call_recordings (
        id,
        session_id,
        company_id,
        contact_id,
        call_sid,
        stream_sid,
        inbound_url,
        outbound_url,
        combined_url,
        codec,
        sample_rate,
        channels,
        inbound_bytes,
        outbound_bytes,
        combined_bytes,
        duration_ms,
        meta
      )
      VALUES (
        COALESCE($1, gen_random_uuid()),
        $2, $3, $4,
        $5, $6,
        $7, $8, $9,
        COALESCE($10, 'mulaw'),
        COALESCE($11, 8000),
        COALESCE($12, 1),
        $13, $14, $15,
        $16,
        $17
      )
      RETURNING *
      `,
      [
        input.id ?? null,
        input.session_id,
        input.company_id,
        input.contact_id,
        input.call_sid ?? null,
        input.stream_sid ?? null,
        input.inbound_url ?? null,
        input.outbound_url ?? null,
        input.combined_url ?? null,
        input.codec ?? null,
        input.sample_rate ?? null,
        input.channels ?? null,
        input.inbound_bytes ?? null,
        input.outbound_bytes ?? null,
        input.combined_bytes ?? null,
        input.duration_ms ?? null,
        input.meta ?? null,
      ]
    );

    return res.rows[0];
  },

  async getById(id: string): Promise<ReassuranceCallRecording | null> {
    const res = await pool.query<ReassuranceCallRecording>(
      `
      SELECT *
      FROM reassurance_call_recordings
      WHERE id = $1
      `,
      [id]
    );
    return res.rows[0] || null;
  },

  async getBySessionId(
    sessionId: string
  ): Promise<ReassuranceCallRecording | null> {
    const res = await pool.query<ReassuranceCallRecording>(
      `
      SELECT *
      FROM reassurance_call_recordings
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [sessionId]
    );
    return res.rows[0] || null;
  },

  async listByContactId(
    contactId: string,
    limit = 50
  ): Promise<ReassuranceCallRecording[]> {
    const res = await pool.query<ReassuranceCallRecording>(
      `
      SELECT *
      FROM reassurance_call_recordings
      WHERE contact_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [contactId, limit]
    );
    return res.rows;
  },

  async updateUrls(
    input: UpdateRecordingUrlsInput
  ): Promise<ReassuranceCallRecording> {
    const res = await pool.query<ReassuranceCallRecording>(
      `
      UPDATE reassurance_call_recordings
      SET
        inbound_url   = COALESCE($2, inbound_url),
        outbound_url  = COALESCE($3, outbound_url),
        combined_url  = COALESCE($4, combined_url),
        inbound_bytes = COALESCE($5, inbound_bytes),
        outbound_bytes= COALESCE($6, outbound_bytes),
        combined_bytes= COALESCE($7, combined_bytes),
        duration_ms   = COALESCE($8, duration_ms),
        meta          = COALESCE($9, meta)
      WHERE id = $1
      RETURNING *
      `,
      [
        input.id,
        input.inbound_url ?? null,
        input.outbound_url ?? null,
        input.combined_url ?? null,
        input.inbound_bytes ?? null,
        input.outbound_bytes ?? null,
        input.combined_bytes ?? null,
        input.duration_ms ?? null,
        input.meta ?? null,
      ]
    );

    return res.rows[0];
  },
};
