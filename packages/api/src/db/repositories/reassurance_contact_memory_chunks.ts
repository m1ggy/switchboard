// src/db/repositories/reassurance_contact_memory_chunks.ts
import pool from '@/lib/pg';

type SourceType = 'call_summary' | 'user_utterance' | 'system_note' | 'other';

export interface ReassuranceContactMemoryChunkRow {
  id: string;
  contact_id: string;
  session_id: string | null;
  source_type: SourceType;
  chunk_text: string;
  embedding: number[]; // pgvector accepts float[] via node-postgres
  importance: number;
  created_at: string;
}
function toPgVector(v: number[]) {
  return `[${v.join(',')}]`;
}

export const ReassuranceContactMemoryChunksRepository = {
  async insert({
    id,
    contact_id,
    session_id,
    source_type,
    chunk_text,
    embedding,
    importance = 1,
  }: {
    id: string;
    contact_id: string;
    session_id?: string | null;
    source_type: SourceType;
    chunk_text: string;
    embedding: number[];
    importance?: number;
  }): Promise<void> {
    await pool.query(
      `
  INSERT INTO reassurance_contact_memory_chunks (
    id, contact_id, session_id, source_type, chunk_text, embedding, importance
  )
  VALUES ($1,$2,$3,$4,$5,$6::vector,$7)
  `,
      [
        id,
        contact_id,
        session_id ?? null,
        source_type,
        chunk_text,
        toPgVector(embedding), // ✅ string like "[...]"
        importance,
      ]
    );
  },

  async searchSimilar({
    contactId,
    queryEmbedding,
    limit = 8,
    minImportance = 1,
  }: {
    contactId: string;
    queryEmbedding: number[];
    limit?: number;
    minImportance?: number;
  }) {
    const res = await pool.query(
      `
      SELECT chunk_text, source_type, session_id, created_at, importance
      FROM reassurance_contact_memory_chunks
      WHERE contact_id = $1
        AND importance >= $3
      ORDER BY embedding <=> $2::vector
      LIMIT $4
      `,
      [
        contactId,
        toPgVector(queryEmbedding), // ✅ CRITICAL: do not pass number[]
        minImportance,
        limit,
      ]
    );

    return res.rows;
  },
};
