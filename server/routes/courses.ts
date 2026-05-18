import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware.js";
import type { Db } from "../db.js";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function coursesRouter(ctx: { db: Db }) {
  const r = Router();

  r.get("/api/courses", requireAuth, async (_req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT id::int AS id, title, video_url, chapters, created_at
       FROM courses ORDER BY created_at DESC`,
    );
    res.json(rows);
  });

  r.post("/api/courses", requireAuth, requireAdmin, async (req, res) => {
    const { title, video_url, chapters } = req.body ?? {};
    if (!title) return res.status(400).json({ error: "title required" });
    const { rows } = await ctx.db.q(
      `INSERT INTO courses (title, video_url, chapters)
       VALUES ($1, $2, $3::jsonb) RETURNING id::int AS id, title, video_url, chapters, created_at`,
      [title, video_url ?? null, JSON.stringify(chapters ?? [])],
    );
    res.json(rows[0]);
  });

  r.put("/api/courses/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(400).json({ error: "invalid id" });
    const { title, video_url, chapters } = req.body ?? {};
    const { rows } = await ctx.db.q(
      `UPDATE courses SET title = $2, video_url = $3, chapters = $4::jsonb
       WHERE id = $1 RETURNING id::int AS id, title, video_url, chapters, created_at`,
      [id, title, video_url ?? null, JSON.stringify(chapters ?? [])],
    );
    if (!rows.length) return res.status(404).end();
    res.json(rows[0]);
  });

  r.delete("/api/courses/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(400).json({ error: "invalid id" });
    await ctx.db.q(`DELETE FROM courses WHERE id = $1`, [id]);
    res.status(204).end();
  });

  return r;
}
