import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);
process.env.RESEND_API_KEY = 'test-key';

// Mock the resend package -- never hit the real API in tests.
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async () => ({ data: { id: 'mock-id' }, error: null }),
    };
  },
}));

async function admin() {
  return signSession({ userId: '1', email: 'admin@x', name: null, picture: null, isAdmin: true });
}
async function user() {
  return signSession({ userId: '2', email: 'u@x', name: null, picture: null, isAdmin: false });
}

describe('routes/send-email', () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
    await pool.query(
      `INSERT INTO users (id, email, is_admin) VALUES (1, 'admin@x', true), (2, 'u@x', false)`,
    );
  });

  it('POST /api/send-email returns 200 with mock id for admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .post('/api/send-email')
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ to: 'recipient@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(r.status).toBe(200);
    expect(r.body.id).toBe('mock-id');
  });

  it('POST /api/send-email returns 403 for non-admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .post('/api/send-email')
      .set('Authorization', `Bearer ${await user()}`)
      .send({ to: 'recipient@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(r.status).toBe(403);
  });

  it('POST /api/send-email returns 400 when required fields missing', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .post('/api/send-email')
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ to: 'recipient@example.com' });
    expect(r.status).toBe(400);
  });
});
