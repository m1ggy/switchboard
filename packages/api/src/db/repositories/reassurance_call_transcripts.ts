// src/db/repositories/reassurance_call_transcripts.ts
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
  words?: any | null;
  raw?: any | null;
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
        $13::jsonb,
        $14::jsonb
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
        input.words != null ? JSON.stringify(input.words) : null,
        input.raw != null ? JSON.stringify(input.raw) : null,
      ]
    );

    return res.rows[0];
  },

  // ...rest unchanged
};
