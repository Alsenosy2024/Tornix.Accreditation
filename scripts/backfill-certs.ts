// Backfill server-rendered certificates for legacy passing assessments.
//
// Usage (against the LIVE deployed background function — Chromium runs on Netlify):
//   SUPABASE_URL=https://xhpdyanfxiuuokygujfj.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   CERT_RENDERER_SECRET=... \
//   SITE_URL=https://tornix-test.ailigent.ai \
//   npx tsx scripts/backfill-certs.ts            # interactive, lists & confirms
//   npx tsx scripts/backfill-certs.ts --dry-run  # list only
//   npx tsx scripts/backfill-certs.ts --apply    # skip the confirm prompt

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET   = process.env.CERT_RENDERER_SECRET;
const SITE_URL = process.env.SITE_URL || 'https://tornix-test.ailigent.ai';

if (!SUPA_URL || !SUPA_KEY || !SECRET) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CERT_RENDERER_SECRET');
  process.exit(1);
}

const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});

// One pass takes ~20s on Netlify; pace at 30s so we don't pile up
// concurrent Chromium processes if multiple are in-flight.
const SPACING_MS = 30_000;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipConfirm = args.has('--apply');

async function main() {
  // Find passing assessments without a stored cert.
  const { data, error } = await sb
    .from('assessments')
    .select('id, user_email, user_name, score, created_at')
    .gte('score', 60)
    .is('cert_storage_path', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`list failed: ${error.message}`);

  const rows = data || [];
  console.log(`Found ${rows.length} passing assessments without a stored cert.`);
  for (const r of rows) {
    console.log(`  id=${r.id} score=${r.score} email=${r.user_email} created=${r.created_at}`);
  }

  if (dryRun || rows.length === 0) return;

  if (!skipConfirm) {
    process.stdout.write('\nPress Enter to start (Ctrl+C to abort)... ');
    await new Promise(res => process.stdin.once('data', res));
  }

  const bgUrl = `${SITE_URL}/.netlify/functions/assessment-cert-generate-background`;
  let ok = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    console.log(`\n[${i + 1}/${rows.length}] triggering id=${r.id} (${r.user_email})...`);
    try {
      const res = await fetch(bgUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ assessmentId: r.id }),
      });
      console.log(`  HTTP ${res.status}`);
      if (res.status === 202 || res.status === 200) ok++;
      else { failed++; console.error(`  body: ${await res.text()}`); }
    } catch (e: any) {
      failed++;
      console.error(`  fetch failed: ${e?.message || e}`);
    }
    if (i < rows.length - 1) {
      console.log(`  waiting ${SPACING_MS / 1000}s before next…`);
      await new Promise(res => setTimeout(res, SPACING_MS));
    }
  }

  console.log(`\nDone. Triggered: ${ok}, failed: ${failed}.`);
  console.log('Wait ~30 more seconds for the last background function to finish, then:');
  console.log('  SELECT count(*) FROM public.assessments WHERE score >= 60 AND cert_storage_path IS NULL;');
}

main().catch(e => { console.error(e); process.exit(1); });
