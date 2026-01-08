import pool from '@/lib/pg';

export type ReassuranceCallLogTranscriptItem = {
  id: string;
  session_id: string;
  recording_id: string | null;
  contact_id: string;
  seq: number;
  speaker: 'user' | 'assistant' | 'system';
  channel: 'inbound' | 'outbound' | 'mixed';
  transcript: string;
  start_ms: number;
  end_ms: number;
  confidence: number | null;
  language: string | null;
  words: any | null;
  raw?: any | null;
  created_at: string;
};

export type ReassuranceCallLog = {
  session: {
    id: string;
    schedule_id: number;
    job_id: string | null;
    call_id: string;
    contact_id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    risk_level: string | null;
    ai_summary: string | null;
    notes_for_human: string | null;
    ai_model: string | null;
  };
  schedule: {
    id: number;
    name: string;
    frequency: string;
    frequency_time: string;
    caller_name: string | null;
  };
  recording: null | {
    id: string;
    inbound_url: string | null;
    outbound_url: string | null;
    combined_url: string | null;
    codec: string | null;
    sample_rate: number | null;
    channels: number | null;
    duration_ms: number | null;
    meta: any | null;
    created_at: string | null;
  };
  transcript: {
    count: number;
    first_ms: number | null;
    last_ms: number | null;
    duration_ms: number | null;
    items?: ReassuranceCallLogTranscriptItem[];
  };
};

type ListCallLogsInput = {
  contactId: string;
  limit?: number;
  includeTranscript?: boolean;
  transcriptLimit?: number;
};

export const ReassuranceCallLogsRepository = {
  async listByContactId({
    contactId,
    limit = 20,
    includeTranscript = false,
    transcriptLimit = 200,
  }: ListCallLogsInput): Promise<ReassuranceCallLog[]> {
    const sessionsRes = await pool.query<{
      session_id: string;
      schedule_id: number;
      job_id: string | null;
      call_id: string;
      contact_id: string;
      started_at: string;
      ended_at: string | null;
      status: string;
      risk_level: string | null;
      ai_summary: string | null;
      notes_for_human: string | null;
      ai_model: string | null;

      schedule_name: string;
      schedule_frequency: string;
      schedule_frequency_time: string;
      schedule_caller_name: string | null;

      recording_id: string | null;
      recording_inbound_url: string | null;
      recording_outbound_url: string | null;
      recording_combined_url: string | null;
      recording_codec: string | null;
      recording_sample_rate: number | null;
      recording_channels: number | null;
      recording_duration_ms: number | null;
      recording_meta: any | null;
      recording_created_at: string | null;

      transcript_count: number;
      transcript_first_ms: number | null;
      transcript_last_ms: number | null;
    }>(
      `
      SELECT
        s.id AS session_id,
        s.schedule_id,
        s.job_id,
        s.call_id,
        s.contact_id,
        s.started_at,
        s.ended_at,
        s.status,
        s.risk_level,
        s.ai_summary,
        s.notes_for_human,
        s.ai_model,

        sch.name AS schedule_name,
        sch.frequency AS schedule_frequency,
        sch.frequency_time::text AS schedule_frequency_time,
        sch.caller_name AS schedule_caller_name,

        r.id AS recording_id,
        r.inbound_url AS recording_inbound_url,
        r.outbound_url AS recording_outbound_url,
        r.combined_url AS recording_combined_url,
        r.codec AS recording_codec,
        r.sample_rate AS recording_sample_rate,
        r.channels AS recording_channels,
        r.duration_ms AS recording_duration_ms,
        r.meta AS recording_meta,
        r.created_at AS recording_created_at,

        COALESCE(tstats.transcript_count, 0) AS transcript_count,
        tstats.first_ms AS transcript_first_ms,
        tstats.last_ms AS transcript_last_ms

      FROM reassurance_call_sessions s
      JOIN reassurance_call_schedules sch
        ON sch.id = s.schedule_id

      LEFT JOIN reassurance_call_recordings r
        ON r.session_id = s.id

      LEFT JOIN (
        SELECT
          session_id,
          COUNT(*)::int AS transcript_count,
          MIN(start_ms) AS first_ms,
          MAX(end_ms) AS last_ms
        FROM reassurance_call_transcripts
        GROUP BY session_id
      ) tstats
        ON tstats.session_id = s.id

      WHERE s.contact_id = $1
      ORDER BY s.started_at DESC
      LIMIT $2
      `,
      [contactId, limit]
    );

    const sessions = sessionsRes.rows;
    if (!sessions.length) return [];

    // If transcript not requested, return summary objects
    if (!includeTranscript) {
      return sessions.map((row) => ({
        session: {
          id: row.session_id,
          schedule_id: row.schedule_id,
          job_id: row.job_id,
          call_id: row.call_id,
          contact_id: row.contact_id,
          started_at: row.started_at,
          ended_at: row.ended_at,
          status: row.status,
          risk_level: row.risk_level,
          ai_summary: row.ai_summary,
          notes_for_human: row.notes_for_human,
          ai_model: row.ai_model,
        },
        schedule: {
          id: row.schedule_id,
          name: row.schedule_name,
          frequency: row.schedule_frequency,
          frequency_time: row.schedule_frequency_time,
          caller_name: row.schedule_caller_name,
        },
        recording: row.recording_id
          ? {
              id: row.recording_id,
              inbound_url: row.recording_inbound_url,
              outbound_url: row.recording_outbound_url,
              combined_url: row.recording_combined_url,
              codec: row.recording_codec,
              sample_rate: row.recording_sample_rate,
              channels: row.recording_channels,
              duration_ms: row.recording_duration_ms,
              meta: row.recording_meta,
              created_at: row.recording_created_at,
            }
          : null,
        transcript: {
          count: row.transcript_count,
          first_ms: row.transcript_first_ms,
          last_ms: row.transcript_last_ms,
          duration_ms:
            row.transcript_first_ms !== null && row.transcript_last_ms !== null
              ? row.transcript_last_ms - row.transcript_first_ms
              : null,
        },
      }));
    }

    // transcript requested → fetch all transcripts for these sessions
    const sessionIds = sessions.map((s) => s.session_id);

    const transcriptRes = await pool.query<ReassuranceCallLogTranscriptItem>(
      `
      SELECT
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
        raw,
        created_at
      FROM reassurance_call_transcripts
      WHERE session_id = ANY($1::uuid[])
      ORDER BY session_id, start_ms ASC, seq ASC
      `,
      [sessionIds]
    );

    // group transcripts by session (cap per session)
    const transcriptsBySession: Record<
      string,
      ReassuranceCallLogTranscriptItem[]
    > = {};
    for (const t of transcriptRes.rows) {
      const sid = t.session_id;
      if (!transcriptsBySession[sid]) transcriptsBySession[sid] = [];
      if (transcriptsBySession[sid].length < transcriptLimit) {
        transcriptsBySession[sid].push(t);
      }
    }

    return sessions.map((row) => ({
      session: {
        id: row.session_id,
        schedule_id: row.schedule_id,
        job_id: row.job_id,
        call_id: row.call_id,
        contact_id: row.contact_id,
        started_at: row.started_at,
        ended_at: row.ended_at,
        status: row.status,
        risk_level: row.risk_level,
        ai_summary: row.ai_summary,
        notes_for_human: row.notes_for_human,
        ai_model: row.ai_model,
      },
      schedule: {
        id: row.schedule_id,
        name: row.schedule_name,
        frequency: row.schedule_frequency,
        frequency_time: row.schedule_frequency_time,
        caller_name: row.schedule_caller_name,
      },
      recording: row.recording_id
        ? {
            id: row.recording_id,
            inbound_url: row.recording_inbound_url,
            outbound_url: row.recording_outbound_url,
            combined_url: row.recording_combined_url,
            codec: row.recording_codec,
            sample_rate: row.recording_sample_rate,
            channels: row.recording_channels,
            duration_ms: row.recording_duration_ms,
            meta: row.recording_meta,
            created_at: row.recording_created_at,
          }
        : null,
      transcript: {
        count: row.transcript_count,
        first_ms: row.transcript_first_ms,
        last_ms: row.transcript_last_ms,
        duration_ms:
          row.transcript_first_ms !== null && row.transcript_last_ms !== null
            ? row.transcript_last_ms - row.transcript_first_ms
            : null,
        items: transcriptsBySession[row.session_id] ?? [],
      },
    }));
  },
};
