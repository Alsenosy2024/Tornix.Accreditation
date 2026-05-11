#!/usr/bin/env node
/**
 * One-shot: load assets/cert-template.jpg into Supabase as the certificate
 * background (settings.cert_bg_bytes + cert_bg_mime). Also seeds sane
 * defaults for the position/colour fields so the cert renders right away.
 *
 * Usage:
 *   DATABASE_URL='postgresql://postgres.xxx:PASS@aws-0-xxx.pooler.supabase.com:6543/postgres' \
 *     node scripts/upload-cert-bg.js
 *
 * Run again any time you replace assets/cert-template.jpg — the row is upserted.
 */

const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const IMG_PATH = path.join(__dirname, '..', 'assets', 'cert-template.jpg');
const MIME     = 'image/jpeg';

// Defaults match the visible layout of the original PDF: name centred at ~37%
// of the height (above the date line), serial centred at ~96% (footer area).
const DEFAULTS = {
  nameY: 37,
  serialY: 96,
  fontFamily: 'font-montserrat',
  nameColor: '#0f172a',
  serialColor: '#1e293b',
  serialFontSize: 20,
};

async function main() {
  const conn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!conn) {
    console.error('Set DATABASE_URL to your Supabase Transaction-pooler connection string.');
    console.error('Find it: Supabase dashboard → Settings → Database → Connection string → Transaction pooler');
    process.exit(1);
  }
  if (!fs.existsSync(IMG_PATH)) {
    console.error(`Missing ${IMG_PATH}`);
    process.exit(1);
  }
  const bytes = fs.readFileSync(IMG_PATH);
  console.log(`Image: ${IMG_PATH} (${(bytes.length/1024).toFixed(1)} KB, mime ${MIME})`);

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Merge into existing JSONB if there's already a row (don't overwrite logo/badge).
  const { rows: existing } = await client.query(`SELECT data FROM public.settings WHERE key='branding'`);
  const data = { ...DEFAULTS, ...(existing[0]?.data || {}) };

  await client.query(
    `INSERT INTO public.settings (key, data, cert_bg_bytes, cert_bg_mime, updated_at)
     VALUES ('branding', $1::jsonb, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET
       data          = public.settings.data || $1::jsonb,
       cert_bg_bytes = EXCLUDED.cert_bg_bytes,
       cert_bg_mime  = EXCLUDED.cert_bg_mime,
       updated_at    = now()`,
    [data, bytes, MIME]
  );

  const { rows: check } = await client.query(
    `SELECT octet_length(cert_bg_bytes) AS bytes, cert_bg_mime AS mime, data
       FROM public.settings WHERE key='branding'`
  );
  console.log('Stored:', check[0]);
  await client.end();
}

main().catch(e => { console.error('Failed:', e); process.exit(1); });
