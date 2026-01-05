import dotenv from 'dotenv';
import path from 'path';
import { Pool, QueryResult, QueryResultRow } from 'pg';

dotenv.config();

if (process.env.NODE_ENV === 'development') {
  dotenv.config({
    path: path.resolve(__dirname, '../../.env.development'),
    override: true,
  });
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('🔥 Unexpected error on idle PostgreSQL client', err);
});

const RETRYABLE_ERRORS = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED'];

// ✅ IMPORTANT: save original query reference BEFORE patching
const originalQuery = pool.query.bind(pool);

async function queryWithRetry<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
  retries = 3,
  delay = 500
): Promise<QueryResult<T>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.warn(`🔁 Retrying query (attempt ${attempt}):`, text);
      }

      // ✅ call the original Pool.query, not the patched one
      return await originalQuery(text, params as any);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;

      if (
        attempt < retries &&
        error &&
        RETRYABLE_ERRORS.includes(error.code ?? error.name)
      ) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error('❌ Query failed:', text, params, error);
      throw error;
    }
  }

  throw new Error('Query unexpectedly failed after retries');
}

// ✅ Patch Pool.query safely (no recursion)
(pool as any).query = queryWithRetry;

export default pool;
