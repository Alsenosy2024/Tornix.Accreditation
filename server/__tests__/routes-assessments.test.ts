import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

async function jwt(p: { email: string; isAdmin?: boolean; id: number }) {
  return signSession({ userId: String(p.id), email: p.email, name: null, picture: null, isAdmin: !!p.isAdmin });
}

describe('routes/assessments', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES
      (1, 'admin@x', true), (2, 'k@example.com', false), (3, 'other@x', false)`);
    await pool.query(`INSERT INTO assessments (user_id, user_email, score, status, answers) VALUES
      (2, 'k@example.com', 90, 'Passed', '[]'::jsonb),
      (3, 'other@x', 30, 'Failed', '[]'::jsonb)`);
  });

  it('GET /api/assessments returns only own rows for non-admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    const r = await request(app).get('/api/assessments').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].user_email).toBe('k@example.com');
  });

  it('GET /api/assessments returns all rows for admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 1, email: 'admin@x', isAdmin: true });
    const r = await request(app).get('/api/assessments').set('Authorization', `Bearer ${t}`);
    expect(r.body).toHaveLength(2);
  });

  it('POST /api/assessments inserts row and enqueues cert job for passing score', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    const r = await request(app).post('/api/assessments')
      .set('Authorization', `Bearer ${t}`)
      .send({
        score: 75, integrity_score: 95, status: 'Passed', answers: [],
        questions_count: 20, user_name: 'Karem', user_photo: null,
      });
    expect(r.status).toBe(200);
    expect(Number(r.body.score)).toBe(75);
    expect(r.body.user_email).toBe('k@example.com');

    const { rows } = await pool.query(`SELECT assessment_id, status FROM cert_jobs`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
  });

  it('POST /api/assessments does NOT enqueue cert job for failing score', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    await request(app).post('/api/assessments')
      .set('Authorization', `Bearer ${t}`)
      .send({ score: 40, integrity_score: 80, status: 'Failed', answers: [], questions_count: 20, user_name: 'K' });

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM cert_jobs`);
    expect(rows[0].n).toBe(0);
  });

  it('POST /api/assessments derives email from JWT (ignores any client-supplied email)', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    const r = await request(app).post('/api/assessments')
      .set('Authorization', `Bearer ${t}`)
      .send({ score: 70, integrity_score: 80, status: 'Passed', answers: [], questions_count: 20,
              user_email: 'attacker@evil.com' });
    expect(r.body.user_email).toBe('k@example.com');
  });
});
