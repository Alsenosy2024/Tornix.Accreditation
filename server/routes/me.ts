import { Router } from 'express';
import { requireAuth } from '../middleware.js';
import type { Db } from '../db.js';

export function meRouter(ctx: { db: Db }) {
  const r = Router();
  r.get('/api/me', requireAuth, async (req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT id::int AS id, email, name, photo_url, is_admin, created_at, last_login_at
       FROM users WHERE id = $1::bigint`,
      [req.user!.userId],
    );
    if (!rows.length) return res.status(404).end();
    res.json(rows[0]);
  });
  return r;
}
