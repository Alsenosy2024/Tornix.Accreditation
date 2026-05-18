import { Router } from 'express';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';

export function healthRouter(opts: { db?: Pool; s3?: S3Client }) {
  const r = Router();
  r.get('/health', async (_req, res) => {
    const out: Record<string, unknown> = { ok: true };
    if (opts.db) {
      try { await opts.db.query('SELECT 1'); out.db = 'up'; }
      catch { out.ok = false; out.db = 'down'; }
    }
    res.status(out.ok ? 200 : 503).json(out);
  });
  return r;
}
