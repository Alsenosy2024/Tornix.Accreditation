import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is not set — check .env.local');

const testDbMatch = testUrl.match(/\/([^/?]+)(\?|$)/);
if (!testDbMatch) throw new Error('Cannot parse DB name from TEST_DATABASE_URL: ' + testUrl);
const testDbName = testDbMatch[1];

// Run psql against the local Postgres (peer auth via unix socket as the tornix unix user).
// On EC2 the tornix system user maps to the tornix postgres role via peer auth.
function adminSql(sql: string) {
  execSync(`psql -d postgres -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}
function testSqlFile(path: string) {
  // Use ON_ERROR_STOP=0 so non-fatal errors from Supabase-only constructs
  // (RLS policies with the "authenticated" role, uuid vs bigint FK in 001)
  // do not abort the entire file. Table/index creation is idempotent.
  execSync(`psql --set ON_ERROR_STOP=0 -d "${testDbName}" -f "${path}"`, { stdio: 'pipe' });
}

beforeAll(() => {
  adminSql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${testDbName}' AND pid <> pg_backend_pid()`);
  adminSql(`DROP DATABASE IF EXISTS "${testDbName}"`);
  adminSql(`CREATE DATABASE "${testDbName}"`);
  testSqlFile('db/schema.sql');
  testSqlFile('db/migrations/001_segmented_courses.sql');
  testSqlFile('db/migrations/002_cert_columns.sql');
  testSqlFile('db/migrations/003_cert_jobs.sql');
  testSqlFile('db/migrations/004_oauth_state_payload.sql');
  // EC2-compatible segment_progress table (migration 001 used uuid/Supabase RLS
  // which fail on EC2; this migration creates the table with bigint user_id).
  testSqlFile('db/migrations/005_segment_progress.sql');
});
