import { db } from '../server/db';
import { storage } from '../server/storage';
import { renderAndUpload } from './render';
import { env } from '../server/env';

const MAX_ATTEMPTS = 3;
const IDLE_SLEEP_MS = 3000;

export async function pollOnce(): Promise<boolean> {
  const claimed = await db.tx(async (c) => {
    const { rows } = await c.query(
      `SELECT id, assessment_id FROM cert_jobs
       WHERE status='pending' AND attempts < $1
       ORDER BY created_at ASC LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS],
    );
    if (!rows.length) return null;
    await c.query(
      `UPDATE cert_jobs SET status='running', attempts=attempts+1, updated_at=now() WHERE id=$1`,
      [rows[0].id],
    );
    return rows[0] as { id: number; assessment_id: number };
  });
  if (!claimed) return false;

  try {
    await renderAndUpload({ db, storage, chromiumPath: env.CHROMIUM_PATH }, claimed.assessment_id);
    await db.q(`UPDATE cert_jobs SET status='done', updated_at=now() WHERE id=$1`, [claimed.id]);
    console.log('[worker] done', claimed);
  } catch (e: any) {
    const errMsg = String(e?.message ?? e);
    const { rows } = await db.q<{ attempts: number }>(
      `SELECT attempts FROM cert_jobs WHERE id=$1`, [claimed.id],
    );
    const final = (rows[0]?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
    await db.q(
      `UPDATE cert_jobs SET status=$2, last_error=$3, updated_at=now() WHERE id=$1`,
      [claimed.id, final ? 'failed' : 'pending', errMsg],
    );
    console.error('[worker] error', claimed, errMsg);
  }
  return true;
}

async function main() {
  console.log('[worker] starting');
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  while (true) {
    const did = await pollOnce();
    if (!did) await new Promise(r => setTimeout(r, IDLE_SLEEP_MS));
  }
}

if (import.meta.url === `file://${encodeURI(process.argv[1]).replace(/%2F/gi, '/')}`) {
  main().catch((e) => { console.error('[worker] fatal', e); process.exit(1); });
}
