#!/usr/bin/env node
/**
 * Import the JSON dumps from ./firebase-export/ into the Supabase Postgres database.
 *
 * Usage:
 *   DATABASE_URL='postgresql://postgres.xxx:PASS@aws-0-xxx.pooler.supabase.com:6543/postgres' \
 *     node scripts/import-postgres.js
 *
 * Find the connection string in:
 *   Supabase dashboard -> Settings -> Database -> Connection string -> Transaction pooler
 *
 * Behavior:
 *   - Branding chunks reassembled into a single value before insert.
 *   - Settings row upserted by key='branding'.
 *   - Courses upserted by legacy_id.
 *   - Assessments inserted with user_id = NULL (FK is to auth.users — no auth.users
 *     row exists for old Firebase uids).  user_email is preserved.  A DB trigger
 *     (`on_public_user_created`) re-attaches these to the new user_id the first
 *     time that email signs in via Supabase Google OAuth.
 *   - Idempotent: every INSERT uses ON CONFLICT.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const EXPORT_DIR = path.join(__dirname, '..', 'firebase-export');

const ADMIN_EMAILS = new Set(['ahmed0ibrahim@gmail.com', 'ahmedzeroibrahim@gmail.com']);

function resolveConnString() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error('Set DATABASE_URL to the Supabase Transaction-pooler connection string.');
    console.error('Find it: Supabase dashboard -> Settings -> Database -> Connection string -> Transaction pooler');
    process.exit(1);
  }
  return url;
}

const readJson = (name) => {
  const file = path.join(EXPORT_DIR, name);
  if (!fs.existsSync(file)) {
    console.warn(`(missing ${file} — skipping)`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

// Firestore Timestamp { __ts: millis } -> Date
const toDate = (v) => {
  if (v && typeof v === 'object' && '__ts' in v) return new Date(v.__ts);
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  return null;
};

// Reassemble chunked branding values.
function assembleBranding(settingsDocs) {
  const main = settingsDocs.find(d => d._id === 'branding');
  if (!main) return null;
  const out = {};
  const chunks = {};
  for (const d of settingsDocs) {
    if (d._id === 'branding') continue;
    const m = d._id.match(/^branding_(.+)_(\d+)$/);
    if (!m) continue;
    const [, field, idx] = m;
    (chunks[field] ||= [])[Number(idx)] = d.data || '';
  }
  for (const [k, v] of Object.entries(main)) {
    if (k.startsWith('_') || k === 'updatedAt') continue;
    if (v && typeof v === 'object' && v.isChunked) {
      out[k] = (chunks[k] || []).join('');
    } else {
      out[k] = v;
    }
  }
  return out;
}

function splitImage(value) {
  if (typeof value !== 'string' || !value) return null;
  const m = value.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { bytes: Buffer.from(m[2], 'base64'), mime: m[1] };
  return { url: value };
}

async function main() {
  const connString = resolveConnString();
  console.log('Connecting:', connString.replace(/:[^:@]+@/, ':***@'));

  const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  });
  await client.connect();

  let courseCount = 0, assessCount = 0, settingsCount = 0;

  await client.query('BEGIN');

  try {
    // -- 1. Settings (branding) --
    const settingsDocs = readJson('settings.json') || [];
    const branding = assembleBranding(settingsDocs);
    if (branding) {
      const logo = splitImage(branding.logo);
      const badge = splitImage(branding.badge);
      const cert = splitImage(branding.certBg);

      const data = { ...branding };
      delete data.logo; delete data.badge; delete data.certBg;
      if (logo?.url)  data.logoUrl   = logo.url;
      if (badge?.url) data.badgeUrl  = badge.url;
      if (cert?.url)  data.certBgUrl = cert.url;

      await client.query(
        `INSERT INTO public.settings
           (key, data, logo_bytes, logo_mime, badge_bytes, badge_mime, cert_bg_bytes, cert_bg_mime, updated_at)
         VALUES ('branding', $1::jsonb, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (key) DO UPDATE SET
           data          = EXCLUDED.data,
           logo_bytes    = COALESCE(EXCLUDED.logo_bytes,    public.settings.logo_bytes),
           logo_mime     = COALESCE(EXCLUDED.logo_mime,     public.settings.logo_mime),
           badge_bytes   = COALESCE(EXCLUDED.badge_bytes,   public.settings.badge_bytes),
           badge_mime    = COALESCE(EXCLUDED.badge_mime,    public.settings.badge_mime),
           cert_bg_bytes = COALESCE(EXCLUDED.cert_bg_bytes, public.settings.cert_bg_bytes),
           cert_bg_mime  = COALESCE(EXCLUDED.cert_bg_mime,  public.settings.cert_bg_mime),
           updated_at    = now()`,
        [
          data,
          logo?.bytes || null, logo?.mime || null,
          badge?.bytes || null, badge?.mime || null,
          cert?.bytes || null, cert?.mime || null,
        ]
      );
      settingsCount = 1;
    }
    console.log(`  settings imported: ${settingsCount}`);

    // -- 2. Courses --
    const courses = readJson('courses.json') || [];
    for (const c of courses) {
      await client.query(
        `INSERT INTO public.courses (legacy_id, title, video_url, chapters, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (legacy_id) DO UPDATE SET
           title      = EXCLUDED.title,
           video_url  = EXCLUDED.video_url,
           chapters   = EXCLUDED.chapters,
           created_at = EXCLUDED.created_at`,
        [c._id, c.title || '', c.videoUrl || null, JSON.stringify(c.chapters || []), toDate(c.createdAt)]
      );
      courseCount++;
    }
    console.log(`  courses imported: ${courseCount}`);

    // -- 3. Assessments --
    // Note: user_id stays NULL until that email signs in via Supabase.
    // The on_public_user_created trigger backfills user_id on first sign-in.
    const authUsers = readJson('auth-users.json') || [];
    const uidToEmail = new Map();
    for (const u of authUsers) {
      if (u.email) uidToEmail.set(u.uid, u.email.toLowerCase());
    }

    const assessments = readJson('assessments.json') || [];
    for (const a of assessments) {
      const ownerUid = a._ownerUid;
      const email = (a.userEmail || uidToEmail.get(ownerUid) || 'unknown@local').toLowerCase();
      const status = a.status || (Number(a.score) >= 60 ? 'Passed' : 'Failed');

      await client.query(
        `INSERT INTO public.assessments
           (legacy_id, user_id, user_email, user_name, user_photo, score, integrity_score,
            serial_number, status, answers, questions_count, created_at)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
         ON CONFLICT (legacy_id) DO NOTHING`,
        [
          a._id,
          email,
          a.userName || null,
          a.userPhoto || null,
          Number(a.score ?? 0),
          Number(a.integrityScore ?? 0),
          a.serialNumber || null,
          status,
          JSON.stringify(a.answers || []),
          a.questionsCount || null,
          toDate(a.createdAt),
        ]
      );
      assessCount++;
    }
    console.log(`  assessments imported: ${assessCount}`);

    await client.query('COMMIT');
    console.log('\nDone.');
    console.log('\nNext: open the live site and sign in via Google with one of the admin emails');
    console.log('(' + Array.from(ADMIN_EMAILS).join(', ') + '). On sign-in, the DB trigger links');
    console.log('that account back to the assessments imported under that email.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
