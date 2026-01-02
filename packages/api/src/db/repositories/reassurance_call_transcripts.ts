import pool from '@/lib/pg';
import { ReassuranceCallTranscript } from '@/types/db';

type CreateTranscriptInput = {
  id?: string;
  session_id: string;
  recording_id?: string | null;
  contact_id: string;

  seq: number;

  speaker: 'user' | 'assistant' | 'system';
  channel: 'inbound' | 'outbound' | 'mixed';

  transcript: string;

  start_ms: number;
  end_ms: number;

  confidence?: number | null;
  language?: string | null;

  words?: any | null; // jsonb
  raw?: any | null; // jsonb
};

export const ReassuranceCallTranscriptsRepository = {
  async create(
    input: CreateTranscriptInput
  ): Promise<ReassuranceCallTranscript> {
    const res = await pool.query<ReassuranceCallTranscript>(
      `
      INSERT INTO reassurance_call_transcripts (
        id,
        session_id,
        recording_id,
        contact_id,
        seq,
        speaker,
        channel,
        transcript,
        start_ms,
        end_ms,
        confidence,
        language,
        words,
        raw
      )
      VALUES (
        COALESCE($1, gen_random_uuid()),
        $2, $3, $4,
        $5, $6, $7,
        $8,
        $9, $10,
        $11, $12,
        $13, $14
      )
      RETURNING *
      `,
      [
        input.id ?? null,
        input.session_id,
        input.recording_id ?? null,
        input.contact_id,
        input.seq,
        input.speaker,
        input.channel,
        input.transcript,
        input.start_ms,
        input.end_ms,
        input.confidence ?? null,
        input.language ?? null,
        input.words ?? null,
        input.raw ?? null,
      ]
    );

    return res.rows[0];
  },

  async listBySessionId(
    sessionId: string
  ): Promise<ReassuranceCallTranscript[]> {
    const res = await pool.query<ReassuranceCallTranscript>(
      `
      SELECT *
      FROM reassurance_call_transcripts
      WHERE session_id = $1
      ORDER BY start_ms ASC, seq ASC
      `,
      [sessionId]
    );
    return res.rows;
  },

  async listByRecordingId(
    recordingId: string
  ): Promise<ReassuranceCallTranscript[]> {
    const res = await pool.query<ReassuranceCallTranscript>(
      `
      SELECT *
      FROM reassurance_call_transcripts
      WHERE recording_id = $1
      ORDER BY start_ms ASC, seq ASC
      `,
      [recordingId]
    );
    return res.rows;
  },

  async getLastSeqForSession(sessionId: string): Promise<number> {
    const res = await pool.query<{ max_seq: number | null }>(
      `
      SELECT MAX(seq) AS max_seq
      FROM reassurance_call_transcripts
      WHERE session_id = $1
      `,
      [sessionId]
    );

    return res.rows[0]?.max_seq ?? 0;
  },

  async deleteBySessionId(sessionId: string): Promise<number> {
    const res = await pool.query<{ count: number }>(
      `
      WITH deleted AS (
        DELETE FROM reassurance_call_transcripts
        WHERE session_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
      `,
      [sessionId]
    );

    return res.rows[0]?.count ?? 0;
  },
};
