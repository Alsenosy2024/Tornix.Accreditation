// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-tcp.ts
// Reads the manifest at MANIFEST_PATH (default below) and upserts the course
// + its segments into Postgres. Idempotent on (slug) and (course_id, num).
//
// Vimeo IDs may be empty strings ("") — those segments will be saved as null
// in the DB and shown as "غير متاح بعد" in the viewer.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const MANIFEST_PATH = process.env.MANIFEST_PATH
  || '/home/karem/side projects/hyperframe/work/segments/manifest.json';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const m = JSON.parse(raw);

  // 1. Upsert course
  const { data: course, error: cErr } = await sb
    .from('segmented_courses')
    .upsert({
      slug: m.course.slug,
      title_ar: m.course.title_ar,
      title_en: m.course.title_en,
      description_ar: m.course.description_ar ?? null,
      description_en: m.course.description_en ?? null,
      language: m.course.language ?? 'ar',
      passing_score_pct: m.course.passing_score_pct ?? 70,
      exam_question_count: m.course.exam_question_count ?? 30,
      unlock_threshold_pct: m.course.unlock_threshold_pct ?? 80,
    }, { onConflict: 'slug' })
    .select('id')
    .single();
  if (cErr || !course) throw new Error(`course upsert failed: ${cErr?.message}`);
  console.log(`course id=${course.id} slug=${m.course.slug}`);

  // 2. Upsert segments
  const rows = m.segments.map((s: any) => ({
    course_id: course.id,
    num: s.num,
    slug: s.slug,
    title_ar: s.title_ar,
    title_en: s.title_en,
    description_ar: s.description_ar ?? null,
    description_en: s.description_en ?? null,
    duration_sec: s.duration_sec ?? 0,
    intro_vimeo_id:   s.vimeo?.intro_id   || null,
    content_vimeo_id: s.vimeo?.content_id || null,
    outro_vimeo_id:   s.vimeo?.outro_id   || null,
    intro_duration_sec: s.intro_duration_sec ?? null,
    outro_duration_sec: s.outro_duration_sec ?? null,
    next_title_ar: s.next_title_ar ?? null,
    next_title_en: s.next_title_en ?? null,
    quiz: s.quiz ?? [],
  }));

  const { error: sErr } = await sb
    .from('course_segments')
    .upsert(rows, { onConflict: 'course_id,num' });
  if (sErr) throw new Error(`segments upsert failed: ${sErr.message}`);
  console.log(`upserted ${rows.length} segments`);
}

main().catch(e => { console.error(e); process.exit(1); });
