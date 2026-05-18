import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { renderAndUpload } from '../render';
import { makeDb } from '../../server/db';
import { storage } from '../../server/storage';

const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome-stable';
const skip = !existsSync(CHROMIUM);

describe.skipIf(skip)('renderAndUpload smoke', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, settings, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    await pool.query(`INSERT INTO settings (key, data) VALUES ('branding', '{}'::jsonb)`);
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, user_name, score, status, answers)
                      VALUES (99, 1, 'u@x', 'Smoke User', 85, 'Passed', '[]'::jsonb)`);
  });

  it('renders a non-empty PDF and uploads it to MinIO', async () => {
    await renderAndUpload(
      { db: makeDb(() => pool), storage, chromiumPath: CHROMIUM },
      99,
    );
    const { rows } = await pool.query(`SELECT cert_storage_path FROM assessments WHERE id=99`);
    expect(rows[0].cert_storage_path).toBe('u@x/99.pdf');

    const url = await storage.presignedGet('u@x/99.pdf', 30);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(5_000);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  }, 60_000);
});
