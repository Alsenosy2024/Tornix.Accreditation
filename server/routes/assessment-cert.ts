import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { requireAuth } from '../middleware.js';
import type { Db } from '../db.js';
import type { Storage } from '../storage.js';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function loadOwnedAssessment(
  db: Db,
  id: number,
  userEmail: string,
  isAdmin: boolean,
) {
  const { rows } = await db.q<{
    user_email: string;
    cert_storage_path: string | null;
    cert_generated_at: Date | null;
    score: string;
  }>(
    `SELECT user_email, cert_storage_path, cert_generated_at, score
     FROM assessments WHERE id = $1`,
    [id],
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (!isAdmin && row.user_email.toLowerCase() !== userEmail.toLowerCase()) {
    return null;
  }
  return row;
}

export function assessmentCertRouter(ctx: { db: Db; storage: Storage }) {
  const r = Router();

  r.get('/api/assessments/:id/cert', requireAuth, async (req, res) => {
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(404).json({ status: 'not_found' });

    const row = await loadOwnedAssessment(ctx.db, id, req.user!.email, req.user!.isAdmin);
    if (!row) return res.status(404).json({ status: 'not_found' });

    if (!row.cert_storage_path) {
      return res.status(200).json({ status: 'pending' });
    }

    res.json({
      status: 'ready',
      pdfUrl: `/api/assessments/${id}/cert/file?format=pdf`,
      pngUrl: `/api/assessments/${id}/cert/file?format=png`,
      cert_generated_at: row.cert_generated_at,
    });
  });

  r.get('/api/assessments/:id/cert/file', requireAuth, async (req, res) => {
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(404).json({ error: 'not_found' });

    const format = String(req.query.format || '');
    if (format !== 'pdf' && format !== 'png') {
      return res.status(400).json({ error: 'format must be pdf or png' });
    }

    const row = await loadOwnedAssessment(ctx.db, id, req.user!.email, req.user!.isAdmin);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (!row.cert_storage_path) return res.status(404).json({ error: 'pending' });

    const pdfKey = row.cert_storage_path;
    const key = format === 'pdf' ? pdfKey : pdfKey.replace(/\.pdf$/, '.png');

    try {
      const obj = await ctx.storage.get(key);
      const filename = `Tornix_Access_Pass_${id}.${format}`;
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      if (obj.contentLength) res.setHeader('Content-Length', String(obj.contentLength));
      res.setHeader('Cache-Control', 'private, max-age=0, no-store');
      await pipeline(obj.body, res);
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'cert file missing in storage' });
      }
      throw e;
    }
  });

  return r;
}
