import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';
import { storage } from '../storage';

process.env.JWT_SECRET = 'a'.repeat(64);

describe('GET /api/assessments/:id/cert', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES (1, 'k@example.com', false), (2, 'other@x', false)`);
  });

  it('returns 404 with status=pending when no cert yet', async () => {
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (10, 1, 'k@example.com', 80, 'Passed', '[]'::jsonb)`);
    const t = await signSession({ userId: '1', email: 'k@example.com', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/assessments/10/cert')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(404);
    expect(r.body.status).toBe('pending');
  });

  it('returns presigned URLs when cert_storage_path is set, after uploading test bytes', async () => {
    await storage.put('k@example.com/11.pdf', Buffer.from('%PDF-fake'), 'application/pdf');
    await storage.put('k@example.com/11.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers, cert_storage_path, cert_generated_at)
                      VALUES (11, 1, 'k@example.com', 80, 'Passed', '[]'::jsonb, 'k@example.com/11.pdf', now())`);

    const t = await signSession({ userId: '1', email: 'k@example.com', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/assessments/11/cert')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ready');
    expect(r.body.cert_pdf_url).toMatch(/\/certificates\/k%40example\.com\/11\.pdf/);

    const dl = await fetch(r.body.cert_pdf_url);
    expect(dl.status).toBe(200);
  });

  it("rejects access to another user's cert (404, not 403, to avoid existence-leak)", async () => {
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (12, 2, 'other@x', 80, 'Passed', '[]'::jsonb)`);
    const t = await signSession({ userId: '1', email: 'k@example.com', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/assessments/12/cert')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(404);
  });
});
