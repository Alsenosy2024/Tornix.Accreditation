import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireAuth, requireAdmin } from '../middleware';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

function app() {
  const a = express();
  a.get('/whoami', requireAuth, (req, res) => res.json((req as any).user));
  a.get('/admin', requireAuth, requireAdmin, (_req, res) => res.json({ ok: true }));
  return a;
}

async function token(p: Partial<Parameters<typeof signSession>[0]> = {}) {
  return signSession({
    userId: '1', email: 'u@example.com', name: null, picture: null, isAdmin: false, ...p,
  });
}

describe('middleware', () => {
  it('401 without auth header', async () => {
    const res = await request(app()).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('401 on bad token', async () => {
    const res = await request(app()).get('/whoami').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('200 with valid token, exposes req.user', async () => {
    const t = await token({ email: 'k@example.com' });
    const res = await request(app()).get('/whoami').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('k@example.com');
  });

  it('403 when admin route accessed by non-admin', async () => {
    const t = await token();
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });

  it('200 when admin route accessed by admin', async () => {
    const t = await token({ isAdmin: true });
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});
