import { Router } from 'express';
import { requireAuth } from '../middleware.js';
import type { Db } from '../db.js';

const COLUMNS = `id::int AS id, user_id, user_email, user_name, user_photo, score, integrity_score,
                 serial_number, status, answers, questions_count, created_at,
                 cert_storage_path, cert_generated_at`;

export function assessmentsRouter(ctx: { db: Db }) {
  const r = Router();

  r.get('/api/assessments', requireAuth, async (req, res) => {
    const { rows } = req.user!.isAdmin
      ? await ctx.db.q(`SELECT ${COLUMNS} FROM assessments ORDER BY created_at DESC LIMIT 500`)
      : await ctx.db.q(
          `SELECT ${COLUMNS} FROM assessments
           WHERE lower(user_email) = lower($1) ORDER BY created_at DESC`,
          [req.user!.email],
        );
    res.json(rows);
  });

  r.post('/api/assessments', requireAuth, async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.score !== 'number') return res.status(400).json({ error: 'score required' });
    if (!b.status) return res.status(400).json({ error: 'status required' });

    // Identity always comes from the JWT, never from the client body.
    const email = req.user!.email;
    const userId = parseInt(req.user!.userId, 10);
    const userName = b.user_name ?? req.user!.name ?? null;
    const userPhoto = b.user_photo ?? req.user!.picture ?? null;
    const serial = `TCP-${Date.now()}-${userId}`;

    const inserted = await ctx.db.tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO assessments
         (user_id, user_email, user_name, user_photo, score, integrity_score,
          serial_number, status, answers, questions_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         RETURNING ${COLUMNS}`,
        [userId, email, userName, userPhoto, b.score, b.integrity_score ?? 0,
         serial, b.status, JSON.stringify(b.answers ?? []), b.questions_count ?? null],
      );
      const row = rows[0];
      if (Number(row.score) >= 60) {
        await c.query(
          `INSERT INTO cert_jobs (assessment_id)
           SELECT $1
           WHERE NOT EXISTS (
             SELECT 1 FROM cert_jobs WHERE assessment_id=$1 AND status IN ('pending','running')
           )`,
          [row.id],
        );
      }
      return row;
    });

    res.json(inserted);
  });

  return r;
}
