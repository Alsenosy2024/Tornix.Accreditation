import { Router } from 'express';
import { requireAuth } from '../middleware.js';
import type { Db } from '../db.js';
import type { Storage } from '../storage.js';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function assessmentCertRouter(ctx: { db: Db; storage: Storage }) {
  const r = Router();

  r.get('/api/assessments/:id/cert', requireAuth, async (req, res) => {
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(404).json({ status: 'not_found' });

    const { rows } = await ctx.db.q<{
      user_email: string; cert_storage_path: string | null; cert_generated_at: Date | null; score: string
    }>(
      `SELECT user_email, cert_storage_path, cert_generated_at, score
       FROM assessments WHERE id = $1`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ status: 'not_found' });
    const row = rows[0];

    // Ownership check — 404 (not 403) to avoid leaking existence.
    if (!req.user!.isAdmin && row.user_email.toLowerCase() !== req.user!.email.toLowerCase()) {
      return res.status(404).json({ status: 'not_found' });
    }

    if (!row.cert_storage_path) return res.status(404).json({ status: 'pending' });

    const pdfKey = row.cert_storage_path;
    const pngKey = pdfKey.replace(/\.pdf$/, '.png');
    const [pdf, png] = await Promise.all([
      ctx.storage.presignedGet(pdfKey, 60 * 60 * 24),
      ctx.storage.presignedGet(pngKey, 60 * 60 * 24),
    ]);
    res.json({
      status: 'ready',
      cert_pdf_url: pdf,
      cert_png_url: png,
      cert_generated_at: row.cert_generated_at,
    });
  });

  return r;
}
