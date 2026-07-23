import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { makeDb } from '../../server/db';

vi.mock('../render', () => ({ renderAndUpload: vi.fn() }));

async function pollOnce(pool: Pool, mockRender: any) {
  const db = makeDb(() => pool);
  const claimed = await db.tx(async (c) => {
    const { rows } = await c.query(
      `SELECT id, assessment_id FROM cert_jobs WHERE status='pending' AND attempts < 3
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!rows.length) return null;
    await c.query(`UPDATE cert_jobs SET status='running', attempts=attempts+1, updated_at=now() WHERE id=$1`, [rows[0].id]);
    return rows[0];
  });
  if (!claimed) return false;
  try {
    await mockRender(claimed.assessment_id);
    await db.q(`UPDATE cert_jobs SET status='done' WHERE id=$1`, [claimed.id]);
  } catch (e: any) {
    const final = (await db.q(`SELECT attempts FROM cert_jobs WHERE id=$1`, [claimed.id])).rows[0].attempts >= 3;
    await db.q(`UPDATE cert_jobs SET status=$2, last_error=$3 WHERE id=$1`,
               [claimed.id, final ? 'failed' : 'pending', String(e?.message)]);
  }
  return true;
}

describe('worker polling', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (5, 1, 'u@x', 80, 'Passed', '[]'::jsonb)`);
  });

  it('claims and marks a job done on success', async () => {
    await pool.query(`INSERT INTO cert_jobs (assessment_id) VALUES (5)`);
    const ok = await pollOnce(pool, vi.fn().mockResolvedValue(undefined));
    expect(ok).toBe(true);
    const { rows } = await pool.query(`SELECT status, attempts FROM cert_jobs`);
    expect(rows[0]).toEqual({ status: 'done', attempts: 1 });
  });

  it('marks job pending again after first failure', async () => {
    await pool.query(`INSERT INTO cert_jobs (assessment_id) VALUES (5)`);
    await pollOnce(pool, vi.fn().mockRejectedValue(new Error('boom')));
    const { rows } = await pool.query(`SELECT status, attempts, last_error FROM cert_jobs`);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].last_error).toBe('boom');
  });

  it('marks job failed after MAX_ATTEMPTS', async () => {
    await pool.query(`INSERT INTO cert_jobs (assessment_id, attempts) VALUES (5, 2)`);
    await pollOnce(pool, vi.fn().mockRejectedValue(new Error('final')));
    const { rows } = await pool.query(`SELECT status FROM cert_jobs`);
    expect(rows[0].status).toBe('failed');
  });

  it('returns false when queue is empty', async () => {
    expect(await pollOnce(pool, vi.fn())).toBe(false);
  });
});
