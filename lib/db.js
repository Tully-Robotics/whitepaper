import { neon } from '@neondatabase/serverless';

// The Vercel Neon integration sets DATABASE_URL (older setups use POSTGRES_URL).
// The schema is managed by the SQL files in db/migrations (npm run db:migrate), not at runtime.
export function db() {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

// Postgres "undefined_table": the database is connected but the migrations have not run.
export const dbHint = (e) =>
  e && e.code === '42P01' ? 'Database tables are missing: run the migrations (npm run db:migrate).' : 'Database error: ' + (e && e.message);
