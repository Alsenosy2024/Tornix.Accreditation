import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

describe('GET /api/me', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, name, photo_url, is_admin)
                      VALUES (42, 'k@example.com', 'Karem', 'pic.jpg', true)`);
  });

  it('401 without token', async () => {
    const app = buildApp({ poolOverride: pool });
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('returns profile from DB (source of truth, not the JWT claims)', async () => {
    const t = await signSession({
      userId: '42', email: 'k@example.com', name: 'Stale Name', picture: null, isAdmin: false,
    });
    const app = buildApp({ poolOverride: pool });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 42, email: 'k@example.com', name: 'Karem', is_admin: true,
    });
  });
});
