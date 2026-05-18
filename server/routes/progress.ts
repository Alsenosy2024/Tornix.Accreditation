import { Router } from 'express';
import { requireAuth } from '../middleware';
import type { Db } from '../db';

export function progressRouter(ctx: { db: Db }) {
  const r = Router();

  // GET /api/progress/:courseSlug  -> caller's progress for the course
  r.get('/api/progress/:courseSlug', requireAuth, async (req, res) => {
    const { courseSlug } = req.params;

    const { rows: courseRows } = await ctx.db.q(
      `SELECT id FROM segmented_courses WHERE slug = $1`,
      [courseSlug],
    );
    if (!courseRows.length) return res.status(404).json({ error: 'course not found' });
    const courseId = courseRows[0].id;

    const { rows: segs } = await ctx.db.q(
      `SELECT id FROM course_segments WHERE course_id = $1`,
      [courseId],
    );
    const ids = segs.map((s) => s.id as bigint);
    if (ids.length === 0) return res.json([]);

    const userId = parseInt(req.user!.userId, 10);
    const { rows } = await ctx.db.q(
      `SELECT segment_id, clip_kind, position_sec, completed_at, updated_at
       FROM segment_progress
       WHERE user_id = $1 AND segment_id = ANY($2::bigint[])`,
      [userId, ids],
    );

    res.json(
      rows.map((row) => ({
        segmentId: row.segment_id,
        clipKind: row.clip_kind,
        positionSec: Number(row.position_sec),
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
      })),
    );
  });

  // POST /api/progress  -> upsert one row {segmentId, clipKind, positionSec, completedAt?}
  r.post('/api/progress', requireAuth, async (req, res) => {
    const b = req.body ?? {};
    const segId = Number(b.segmentId);
    const kind: string = b.clipKind;
    const pos = Number(b.positionSec);

    if (!segId || !['intro', 'content', 'outro'].includes(kind) || !Number.isFinite(pos)) {
      return res.status(400).json({ error: 'segmentId, clipKind, positionSec required' });
    }

    const userId = parseInt(req.user!.userId, 10);

    await ctx.db.q(
      `INSERT INTO segment_progress (user_id, segment_id, clip_kind, position_sec, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, segment_id, clip_kind) DO UPDATE SET
         position_sec = EXCLUDED.position_sec,
         completed_at = EXCLUDED.completed_at,
         updated_at   = now()`,
      [userId, segId, kind, pos, b.completedAt ?? null],
    );

    res.json({ ok: true });
  });

  return r;
}
