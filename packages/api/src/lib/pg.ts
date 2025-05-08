import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const client = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function connectDB() {
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');
  } catch (err) {
    console.error('❌ Connection error', err);
  }
}

export default client;
