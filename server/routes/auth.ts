import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { startGoogleAuth, consumeGoogleCallback, type AuthCtx } from '../auth.js';

export function authRouter(ctx: AuthCtx) {
  const r = Router();

  r.get('/api/auth/google', async (req, res) => {
    const state = randomUUID();
    const next = (req.query.next as string) || '/';
    const url = await startGoogleAuth(ctx, { state, next });
    res.redirect(302, url);
  });

  r.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code || !state) return res.status(400).send('missing code or state');
      const { next, jwt } = await consumeGoogleCallback(ctx, { code, state });
      // Open-redirect-safe: only accept paths starting with `/` followed by a non-`/` char.
      // Rejects '//evil.com', 'http://evil.com', etc.
      const safeNext = (next === '/' || /^\/[^/]/.test(next)) ? next : '/';
      res.redirect(302, `${safeNext}#token=${jwt}`);
    } catch (e: any) {
      res.status(400).send(`oauth callback failed: ${e?.message || 'unknown'}`);
    }
  });

  return r;
}
