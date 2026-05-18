import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Derive the test DB name from TEST_DATABASE_URL.
const testUrl = process.env.TEST_DATABASE_URL!;
const testDbName = testUrl.match(/\/([^/?]+)(\?|$)/)![1]; // e.g. "tornix_test"

// Root of the repo (two levels up from server/__tests__/).
// vitest runs with cwd = repo root, so path.resolve('.') is sufficient,
// but we pin it explicitly for clarity.
const repoRoot = path.resolve(__dirname, '../..');

/**
 * Run a SQL string against the dockerised Postgres.
 * Uses docker compose exec so no host psql is required.
 * Double-quotes inside `sql` are escaped to keep the shell happy.
 * Returns false if the command fails (so callers can ignore non-fatal errors).
 */
function psqlCmd(database: string, sql: string, { ignoreErrors = false } = {}): boolean {
  const escaped = sql.replace(/"/g, '\\"');
  try {
    execSync(
      `docker compose -f docker-compose.dev.yml exec -T postgres psql -U tornix -d ${database} -c "${escaped}"`,
      { stdio: 'pipe', cwd: repoRoot },
    );
    return true;
  } catch (e) {
    if (!ignoreErrors) throw e;
    return false;
  }
}

/**
 * Pipe a .sql file into the dockerised Postgres.
 * Errors in individual SQL statements are non-fatal (ON_ERROR_STOP is off by
 * default), so Supabase-specific RLS / auth.uid() / storage.buckets statements
 * fail silently while all DDL that is valid on plain Postgres succeeds.
 */
function psqlFile(database: string, sqlRelPath: string) {
  const fullPath = path.join(repoRoot, sqlRelPath);
  execSync(
    `docker compose -f docker-compose.dev.yml exec -T postgres psql -U tornix -d ${database} < "${fullPath}"`,
    { stdio: 'pipe', shell: '/bin/bash', cwd: repoRoot },
  );
}

// Drop + recreate the test database before the suite runs.
// This keeps each full test run deterministic and isolated from dev data.
// Note: vitest may run this beforeAll once per worker. The CREATE DATABASE
// may therefore race; we tolerate "already exists" gracefully.
beforeAll(() => {
  // Terminate any open connections so DROP DATABASE doesn't block.
  psqlCmd('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${testDbName}'`);
  psqlCmd('postgres', `DROP DATABASE IF EXISTS ${testDbName}`, { ignoreErrors: true });
  // CREATE DATABASE has no IF NOT EXISTS in Postgres — ignore if another
  // worker already created it between our DROP and this CREATE.
  psqlCmd('postgres', `CREATE DATABASE ${testDbName}`, { ignoreErrors: true });

  // Apply schema + migrations. Non-fatal errors from Supabase-specific
  // statements (RLS policies, auth.uid(), storage.buckets) are ignored.
  psqlFile(testDbName, 'db/schema.sql');
  psqlFile(testDbName, 'db/migrations/001_segmented_courses.sql');
  psqlFile(testDbName, 'db/migrations/002_cert_columns.sql');
  psqlFile(testDbName, 'db/migrations/004_oauth_state_payload.sql');
});
