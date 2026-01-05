import dotenv from 'dotenv';
import path from 'path';
import { Pool, QueryResultRow } from 'pg';

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

async function queryWithRetry<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
  retries = 3,
  delay = 500
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0)
        console.warn(`🔁 Retrying query (attempt ${attempt}):`, text);
      return await pool.query<T>(text, params);
    } catch (err: any) {
      if (
        attempt < retries &&
        err &&
        RETRYABLE_ERRORS.includes(err.code ?? err.name)
      ) {
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error('❌ Query failed:', text, params, err);
      throw err;
    }
  }

  throw new Error('Query unexpectedly failed after retries');
}

/**
 * ✅ Monkey patch pool.query
 * keeps .connect(), .end(), etc.
 */
(pool as any).query = queryWithRetry;

export default pool;
