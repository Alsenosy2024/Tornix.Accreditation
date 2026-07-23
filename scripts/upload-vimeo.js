// Vimeo uploader for the TCP segmented course player.
//
// Usage:
//   1. Put VIMEO_ACCESS_TOKEN in .env (already done if running through Claude)
//   2. node scripts/upload-vimeo.js
//
// What it does:
//   - Reads /home/karem/side projects/hyperframe/work/segments/manifest.json
//   - For each segment (1..22), uploads intro/content/outro mp4 to Vimeo
//   - Sets privacy: hidden from vimeo.com, embed whitelist
//   - Adds tornix-test.ailigent.ai + localhost as allowed embed domains
//   - Writes the resulting numeric IDs back into manifest.json
//   - Idempotent: skips any clip that already has a Vimeo ID in the manifest

import 'dotenv/config';
import { Vimeo } from '@vimeo/vimeo';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const MANIFEST_PATH = process.env.MANIFEST_PATH
  || '/home/karem/side projects/hyperframe/work/segments/manifest.json';
const WORK_ROOT = process.env.WORK_ROOT
  || '/home/karem/side projects/hyperframe';

const TOKEN = process.env.VIMEO_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('VIMEO_ACCESS_TOKEN env var is required');
  process.exit(1);
}

// Vimeo SDK uses a 3-arg constructor for personal access tokens:
// the client_id and client_secret are not used when the token is provided.
const client = new Vimeo(null, null, TOKEN);

const EMBED_DOMAINS = ['tornix-test.ailigent.ai', 'localhost'];

const KIND_TO_FOLDER = {
  intro: 'intros',
  content: 'segments',
  outro: 'outros',
};
const KIND_TO_PREFIX = {
  intro: 'intro',
  content: 'content',
  outro: 'outro',
};

function localPath(kind, num) {
  const folder = KIND_TO_FOLDER[kind];
  const prefix = KIND_TO_PREFIX[kind];
  const n = String(num).padStart(2, '0');
  return resolve(WORK_ROOT, 'work', folder, `${prefix}-${n}.mp4`);
}

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}
function saveManifest(m) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
}

// Promise-wrapped sdk.upload that yields the numeric video id.
function uploadOne(filePath, params) {
  return new Promise((res, rej) => {
    client.upload(
      filePath,
      params,
      (uri) => {
        // uri looks like "/videos/123456789"
        const id = String(uri).split('/').pop();
        res(id);
      },
      (bytesUploaded, bytesTotal) => {
        const pct = ((bytesUploaded / bytesTotal) * 100).toFixed(1);
        process.stdout.write(`\r    ${pct}% (${bytesUploaded}/${bytesTotal})`);
      },
      (error) => rej(error)
    );
  });
}

// Set domain-whitelist embed privacy on a video after upload.
function setEmbedPrivacy(videoId) {
  return new Promise((res, rej) => {
    client.request(
      {
        method: 'PATCH',
        path: `/videos/${videoId}`,
        query: {
          privacy: {
            view: 'disable',         // not viewable on vimeo.com
            embed: 'whitelist',      // only specific domains can embed
            comments: 'nobody',
            download: false,
            add: false,
          },
          hide_from_vimeo: true,
        },
      },
      (err, body) => err ? rej(err) : res(body)
    );
  });
}

function whitelistDomain(videoId, domain) {
  return new Promise((res, rej) => {
    client.request(
      { method: 'PUT', path: `/videos/${videoId}/privacy/domains/${domain}` },
      (err, body) => err ? rej(err) : res(body)
    );
  });
}

async function main() {
  const manifest = loadManifest();
  const courseSlug = manifest.course?.slug || 'tcp';
  const segments = manifest.segments;
  if (!Array.isArray(segments)) throw new Error('manifest.segments is not an array');

  // Count how many clips need uploading vs are already done.
  let todo = 0, done = 0, missing = 0;
  for (const s of segments) {
    s.vimeo = s.vimeo || { intro_id: '', content_id: '', outro_id: '' };
    for (const kind of ['intro', 'content', 'outro']) {
      const key = `${kind}_id`;
      if (s.vimeo[key]) done++;
      else {
        const fp = localPath(kind, s.num);
        try { statSync(fp); todo++; }
        catch { missing++; console.warn(`missing file: ${fp}`); }
      }
    }
  }

  console.log(`Plan: ${todo} to upload, ${done} already uploaded, ${missing} missing files.\n`);
  if (todo === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Process segments in order, one clip at a time (sequential — easier on the API).
  let uploaded = 0;
  for (const s of segments) {
    for (const kind of ['intro', 'content', 'outro']) {
      const key = `${kind}_id`;
      if (s.vimeo[key]) continue;
      const fp = localPath(kind, s.num);
      try { statSync(fp); } catch { continue; }
      const title = `${courseSlug}-${String(s.num).padStart(2, '0')}-${kind}`;
      console.log(`[${++uploaded}/${todo}] ${title}`);
      try {
        const id = await uploadOne(fp, {
          name: title,
          description: `${courseSlug.toUpperCase()} segment ${s.num} (${kind})`,
          privacy: { view: 'disable', embed: 'whitelist', download: false, add: false, comments: 'nobody' },
          hide_from_vimeo: true,
        });
        process.stdout.write(`\r    uploaded id=${id}                              \n`);
        s.vimeo[key] = id;

        // Persist after each successful upload — resume-safe.
        saveManifest(manifest);

        // Set privacy + whitelist domains. Best-effort: don't fail the run if these error.
        try { await setEmbedPrivacy(id); } catch (e) { console.warn(`    (privacy set failed: ${e?.message || e})`); }
        for (const d of EMBED_DOMAINS) {
          try { await whitelistDomain(id, d); }
          catch (e) { console.warn(`    (whitelist ${d} failed: ${e?.message || e})`); }
        }
      } catch (e) {
        console.error(`\n    UPLOAD FAILED: ${title} — ${e?.message || e}`);
        console.error('    Continuing with the next clip. Re-run later to retry.');
      }
    }
  }

  console.log('\nDone. Re-run `npm run seed:tcp` to push the new Vimeo IDs to Postgres.');
}

main().catch(e => { console.error(e); process.exit(1); });
