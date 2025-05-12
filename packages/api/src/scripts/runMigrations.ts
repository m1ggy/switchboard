// scripts/run-migrate.js
import { spawn } from 'child_process';
import { config } from 'dotenv';

config();

function buildDatabaseUri() {
  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;

  if (!DB_USER || !DB_PASSWORD || !DB_HOST || !DB_PORT || !DB_NAME) {
    throw new Error(
      'Missing required environment variables for database connection'
    );
  }

  return `postgres://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

process.env.DATABASE_URL = buildDatabaseUri();

const args = process.argv.slice(2);

const migrate = spawn(
  'node-pg-migrate',
  ['--migrations-dir', 'src/db/migrations', ...args],
  { stdio: 'inherit', env: process.env }
);

migrate.on('exit', process.exit);
