import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware.js";
import type { Db } from "../db.js";

function rowToBody(row: any) {
  return {
    key: row.key,
    data: row.data,
    logo_b64: row.logo_bytes ? Buffer.from(row.logo_bytes).toString("base64") : null,
    logo_mime: row.logo_mime,
    badge_b64: row.badge_bytes ? Buffer.from(row.badge_bytes).toString("base64") : null,
    badge_mime: row.badge_mime,
    cert_bg_b64: row.cert_bg_bytes ? Buffer.from(row.cert_bg_bytes).toString("base64") : null,
    cert_bg_mime: row.cert_bg_mime,
    updated_at: row.updated_at,
  };
}

export function settingsBrandingRouter(ctx: { db: Db }) {
  const r = Router();

  r.get("/api/settings/branding", async (_req, res) => {
    const { rows } = await ctx.db.q(`SELECT * FROM settings WHERE key='branding'`);
    if (!rows.length) return res.json({ key: "branding", data: {}, logo_b64: null, badge_b64: null, cert_bg_b64: null });
    res.json(rowToBody(rows[0]));
  });

  r.patch("/api/settings/branding", requireAuth, requireAdmin, async (req, res) => {
    const body = req.body ?? {};
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (body.data) { sets.push(`data = data || $${i++}::jsonb`); params.push(JSON.stringify(body.data)); }
    if (typeof body.logo_b64 === "string") {
      sets.push(`logo_bytes = decode($${i++}, 'base64')`); params.push(body.logo_b64);
      sets.push(`logo_mime = $${i++}`); params.push(body.logo_mime ?? "image/png");
    }
    if (typeof body.badge_b64 === "string") {
      sets.push(`badge_bytes = decode($${i++}, 'base64')`); params.push(body.badge_b64);
      sets.push(`badge_mime = $${i++}`); params.push(body.badge_mime ?? "image/png");
    }
    if (typeof body.cert_bg_b64 === "string") {
      sets.push(`cert_bg_bytes = decode($${i++}, 'base64')`); params.push(body.cert_bg_b64);
      sets.push(`cert_bg_mime = $${i++}`); params.push(body.cert_bg_mime ?? "image/jpeg");
    }
    if (!sets.length) return res.status(400).json({ error: "nothing to update" });
    sets.push(`updated_at = now()`);

    const sql = `UPDATE settings SET ${sets.join(", ")} WHERE key='branding' RETURNING *`;
    const { rows } = await ctx.db.q(sql, params);
    if (!rows.length) return res.status(404).end();
    res.json(rowToBody(rows[0]));
  });

  return r;
}
