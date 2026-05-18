import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { authRouter } from '../routes/auth';
import { makeDb } from '../db';

process.env.JWT_SECRET = 'a'.repeat(64);

// Mock google-auth-library so the test never hits Google.
vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: class {
      generateAuthUrl(opts: any) {
        return `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}`;
      }
      async getToken(_code: string) {
        return { tokens: { id_token: 'fake-id-token' } };
      }
      async verifyIdToken(_opts: any) {
        return {
          getPayload: () => ({
            sub: 'google-sub-123',
            email: 'k@example.com',
            email_verified: true,
            name: 'Karem',
            picture: 'https://example.com/pic.jpg',
          }),
        };
      }
    },
  };
});

function makeApp(pool: Pool) {
  const app = express();
  app.use(authRouter({ db: makeDb(() => pool), publicBaseUrl: 'http://localhost:3000' }));
  return app;
}

describe('GET /api/auth/google → /callback', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE oauth_state, users RESTART IDENTITY CASCADE');
  });

  it('start: stores state and redirects to google', async () => {
    const res = await request(makeApp(pool)).get('/api/auth/google?next=/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com.*state=/);
    const { rows } = await pool.query('SELECT state FROM oauth_state');
    expect(rows).toHaveLength(1);
  });

  it('callback: validates state, upserts user, redirects with token in fragment', async () => {
    await pool.query(`INSERT INTO oauth_state (state, payload) VALUES ('xyz', $1)`,
                     [JSON.stringify({ next: '/dashboard' })]);
    const res = await request(makeApp(pool)).get('/api/auth/google/callback?code=c&state=xyz');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/dashboard#token=eyJ/);
    const { rows } = await pool.query('SELECT email, google_sub FROM users');
    expect(rows[0]).toMatchObject({ email: 'k@example.com', google_sub: 'google-sub-123' });
    const stale = await pool.query('SELECT count(*) FROM oauth_state');
    expect(stale.rows[0].count).toBe('0');     // state row consumed
  });

  it('callback: rejects unknown state', async () => {
    const res = await request(makeApp(pool)).get('/api/auth/google/callback?code=c&state=missing');
    expect(res.status).toBe(400);
  });
});
