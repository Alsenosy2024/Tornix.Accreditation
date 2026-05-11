# Segmented Course Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Udemy-style course player inside the existing `Tornix.Accreditation` site that chains 22 segments × 3 Vimeo clips (intro/content/outro), tracks per-user progress, and hands off to the existing exam wizard.

**Architecture:** Add three new Postgres tables (`segmented_courses`, `course_segments`, `segment_progress`) parallel to the existing `courses` table; three new Netlify Functions (`segmented-courses`, `progress`, `transcript`); one new React component (`SegmentedCourseViewer`) and admin (`SegmentedCoursesAdmin`); keep all existing auth/exam/cert infrastructure untouched.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind (existing); Supabase Postgres + Google OAuth (existing); Netlify Functions (existing); `@vimeo/player` (new); Vitest + @testing-library/react (new, for tests).

**Spec:** `docs/superpowers/specs/2026-05-11-segmented-course-player-design.md`

---

## Conventions used throughout this plan

- **Working directory for all commands:** `/home/karem/projects/tornix test/Tornix.Accreditation/` (run `cd` once at the start of each task).
- **Arabic strings** in code must be wrapped in double quotes. The codebase uses Arabic literal strings throughout — no i18n framework.
- **RTL** is the default; styling already mirrors via the `lang` prop (`isAr = lang === 'ar'`).
- **Bilingual** functions take `lang: 'ar' | 'en'` and switch from there.
- **Git commits** — small and frequent. Don't push.

---

## Task 1: Verify live `users` table schema

The repo's `db/schema.sql` declares `users.id BIGSERIAL` but `netlify/functions/assessments.ts` inserts `user_id: session.userId` where `session.userId` is the auth.users UUID (string). The live schema must therefore differ from `db/schema.sql`. Confirm before writing migrations.

**Files:**
- Read: `netlify/functions/assessments.ts` (no edits, just verify the pattern)

- [ ] **Step 1: Inspect the live `users` table column types**

Run via the Supabase MCP (or `mcp__supabase__list_tables`):

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users';
```

- [ ] **Step 2: Note the result for use in Task 4**

Expected: `id` is `uuid`. If it is `bigint`, all new tables in Task 4 must use `bigint user_id` and the Functions must resolve UUID → bigint via email lookup. **Stop and ask the user how to proceed if `id` is `bigint` and the existing code seems to work anyway** (means there's hidden conversion logic).

- [ ] **Step 3: Inspect `auth.uid()` return type**

```sql
SELECT auth.uid();
```

Should return `uuid`. This determines the RLS policy comparison in Task 4.

**Plan assumption from here on:** `users.id` is `uuid` matching `auth.users(id)`. If verification in Step 2 contradicts this, every `uuid` reference below must be revised.

---

## Task 2: Add Vitest + React Testing Library

No test framework is currently installed. We need one for the reducer (TDD) and pure helpers.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/example.test.ts`

- [ ] **Step 1: Install Vitest + React Testing Library**

```bash
cd "/home/karem/projects/tornix test/Tornix.Accreditation"
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8
```

- [ ] **Step 2: Add test scripts to `package.json`**

Modify the `"scripts"` block in `package.json`, adding two lines:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 4: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create `src/test/example.test.ts` and verify the runner works**

```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```

Run: `npm run test:run`
Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/
git commit -m "test: add vitest + react testing library setup"
```

---

## Task 3: Run lint to capture baseline

Establish a green baseline before adding code so regressions are obvious later.

- [ ] **Step 1: Run lint**

```bash
cd "/home/karem/projects/tornix test/Tornix.Accreditation"
npm run lint
```

Expected: exits 0 (or, if there are pre-existing errors, write them to `/tmp/lint-baseline.txt` for comparison later).

- [ ] **Step 2: Save baseline if non-zero**

```bash
npm run lint > /tmp/lint-baseline.txt 2>&1 || true
```

---

## Task 4: Schema migration

Add three new tables with RLS and policies.

**Files:**
- Create: `db/migrations/001_segmented_courses.sql`

- [ ] **Step 1: Create `db/migrations/001_segmented_courses.sql`**

```sql
-- Segmented courses (Udemy-style chained playback)

create table public.segmented_courses (
  id                    bigserial primary key,
  slug                  text not null unique,
  title_ar              text not null,
  title_en              text not null,
  description_ar        text,
  description_en        text,
  language              text not null default 'ar' check (language in ('ar','en')),
  passing_score_pct     int  not null default 70,
  exam_question_count   int  not null default 30,
  unlock_threshold_pct  int  not null default 80,
  created_at            timestamptz not null default now()
);

create table public.course_segments (
  id                  bigserial primary key,
  course_id           bigint not null references public.segmented_courses(id) on delete cascade,
  num                 int    not null,
  slug                text   not null,
  title_ar            text   not null,
  title_en            text   not null,
  description_ar      text,
  description_en      text,
  duration_sec        numeric(8,2) not null default 0,
  intro_vimeo_id      text,
  content_vimeo_id    text,
  outro_vimeo_id      text,
  intro_duration_sec  numeric(6,2),
  outro_duration_sec  numeric(6,2),
  next_title_ar       text,
  next_title_en       text,
  quiz                jsonb not null default '[]'::jsonb,
  unique (course_id, num)
);
create index course_segments_by_course on public.course_segments(course_id, num);

create table public.segment_progress (
  user_id       uuid not null references public.users(id) on delete cascade,
  segment_id    bigint not null references public.course_segments(id) on delete cascade,
  clip_kind     text   not null check (clip_kind in ('intro','content','outro')),
  position_sec  numeric(8,2) not null default 0,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, segment_id, clip_kind)
);
create index segment_progress_by_user on public.segment_progress(user_id);

-- RLS
alter table public.segmented_courses enable row level security;
alter table public.course_segments   enable row level security;
alter table public.segment_progress  enable row level security;

-- Course catalog: any authenticated user can read
create policy "auth read courses" on public.segmented_courses
  for select to authenticated using (true);
create policy "auth read segments" on public.course_segments
  for select to authenticated using (true);

-- Admin write on catalog (uses public.users.is_admin)
create policy "admin write courses" on public.segmented_courses
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));
create policy "admin write segments" on public.course_segments
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));

-- Progress: own rows only
create policy "own progress select" on public.segment_progress
  for select to authenticated using (user_id = auth.uid());
create policy "own progress insert" on public.segment_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "own progress update" on public.segment_progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use `mcp__supabase__execute_sql` against project `xhpdyanfxiuuokygujfj`. Paste the entire SQL above and execute.

Expected: no error. If a table already exists, the migration is not idempotent — drop manually first or add `if not exists` and retry.

- [ ] **Step 3: Run advisors**

Call `mcp__supabase__get_advisors`. Read every WARN / ERROR and fix in the SQL inline, then re-apply. Most likely issues:
- Missing index on FK column → already covered above
- RLS policy uses `user_metadata` (which is unsafe) → we don't, but verify

- [ ] **Step 4: Verify with `list_tables`**

Call `mcp__supabase__list_tables` and confirm `segmented_courses`, `course_segments`, `segment_progress` all show up with `rls_enabled: true`.

- [ ] **Step 5: Commit the migration file**

```bash
git add db/migrations/001_segmented_courses.sql
git commit -m "feat(db): add segmented_courses, course_segments, segment_progress tables"
```

---

## Task 5: Extend manifest.json

Add the new fields the seed script needs. Vimeo IDs are left empty for now — filled in Task 27 after upload.

**Files:**
- Modify: `/home/karem/side projects/hyperframe/work/segments/manifest.json`

- [ ] **Step 1: Add course-level fields**

Inside the top-level `"course"` object, add (preserve all existing keys):

```json
"passing_score_pct": 70,
"exam_question_count": 30,
"unlock_threshold_pct": 80
```

- [ ] **Step 2: Add per-segment Vimeo placeholder + duration fields**

For each segment in the `"segments"` array (all 22), add these keys (alongside the existing `intro_mp4`, `outro_mp4`, etc.):

```json
"vimeo": { "intro_id": "", "content_id": "", "outro_id": "" },
"intro_duration_sec": 5.0,
"outro_duration_sec": 5.0
```

(Use `5.0` as a default — the actual values will be filled when Vimeo upload reports them. If precise values are already known from `ffprobe` over the local files, use those instead.)

- [ ] **Step 3: Validate it's still valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('/home/karem/side projects/hyperframe/work/segments/manifest.json'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit (in the hyperframe repo, if it's tracked)**

The `hyperframe` directory may or may not be a git repo — skip this step if it isn't.

```bash
cd "/home/karem/side projects/hyperframe/work" 2>/dev/null && git add segments/manifest.json && git commit -m "data: extend TCP manifest with vimeo+duration fields" 2>/dev/null || true
```

---

## Task 6: Write seed script

Idempotent script that reads `manifest.json` and upserts into Postgres. Safe to re-run after each Vimeo ID is filled.

**Files:**
- Create: `scripts/seed-tcp.ts`
- Modify: `package.json` (add script entry)

- [ ] **Step 1: Create `scripts/seed-tcp.ts`**

```ts
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
```

- [ ] **Step 2: Add `tsx` as a dev dependency and a script entry**

```bash
npm install --save-dev tsx
```

Add to `package.json` `"scripts"`:

```json
"seed:tcp": "tsx scripts/seed-tcp.ts"
```

- [ ] **Step 3: Run the seed against Supabase**

Get service role key from Supabase dashboard. Export and run:

```bash
export SUPABASE_URL="https://xhpdyanfxiuuokygujfj.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<paste-from-dashboard>"
npm run seed:tcp
```

Expected:
```
course id=1 slug=tcp
upserted 22 segments
```

- [ ] **Step 4: Verify rows via Supabase MCP**

```sql
SELECT id, slug FROM public.segmented_courses;
SELECT count(*) FROM public.course_segments WHERE course_id = 1;
```

Expected: course id=1 slug=tcp, segment count=22.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-tcp.ts package.json package-lock.json
git commit -m "feat(scripts): add seed-tcp.ts for segmented_courses"
```

---

## Task 7: Netlify Function — `segmented-courses.ts`

GET list, GET by slug (with segments), POST create/update. Follows the existing `courses.ts` shape exactly.

**Files:**
- Create: `netlify/functions/segmented-courses.ts`
- Modify: `netlify.toml` (add redirect rule)
- Create: `src/test/functions/segmented-courses.test.ts`

- [ ] **Step 1: Add the redirect rule in `netlify.toml`**

Append (don't remove existing redirects):

```toml
[[redirects]]
  from = "/api/segmented-courses"
  to = "/.netlify/functions/segmented-courses"
  status = 200

[[redirects]]
  from = "/api/segmented-courses/:slug"
  to = "/.netlify/functions/segmented-courses?slug=:slug"
  status = 200
```

- [ ] **Step 2: Create `netlify/functions/segmented-courses.ts`**

```ts
import type { Handler } from '@netlify/functions';
import { clientFor, getSession } from '../lib/supabase';

// GET  /api/segmented-courses             -> list (id, slug, title_ar, title_en)
// GET  /api/segmented-courses/:slug       -> full course + segments
// POST /api/segmented-courses             -> upsert course + segments (admin only via RLS)

export const handler: Handler = async (event) => {
  const supabase = clientFor(event);

  if (event.httpMethod === 'GET') {
    const slug = event.queryStringParameters?.slug || null;

    if (slug) {
      // detail: course + segments
      const { data: course, error: cErr } = await supabase
        .from('segmented_courses')
        .select('*')
        .eq('slug', slug)
        .single();
      if (cErr || !course) {
        return { statusCode: 404, body: JSON.stringify({ error: 'course not found' }) };
      }
      const { data: segments, error: sErr } = await supabase
        .from('course_segments')
        .select('*')
        .eq('course_id', course.id)
        .order('num', { ascending: true });
      if (sErr) return { statusCode: 500, body: JSON.stringify({ error: sErr.message }) };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: camelCourse(course), segments: (segments || []).map(camelSegment) }),
      };
    }

    // list
    const { data, error } = await supabase
      .from('segmented_courses')
      .select('id, slug, title_ar, title_en, created_at')
      .order('created_at', { ascending: false });
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify((data || []).map((r: any) => ({
        id: r.id, slug: r.slug, titleAr: r.title_ar, titleEn: r.title_en, createdAt: r.created_at,
      }))),
    };
  }

  if (event.httpMethod === 'POST') {
    const session = await getSession(event);
    if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };
    if (!session.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: 'admin only' }) };

    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

    if (!body.slug || !body.titleAr || !body.titleEn) {
      return { statusCode: 400, body: JSON.stringify({ error: 'slug, titleAr, titleEn required' }) };
    }

    // upsert course
    const { data: course, error: cErr } = await supabase
      .from('segmented_courses')
      .upsert({
        slug: body.slug,
        title_ar: body.titleAr,
        title_en: body.titleEn,
        description_ar: body.descriptionAr ?? null,
        description_en: body.descriptionEn ?? null,
        language: body.language ?? 'ar',
        passing_score_pct: body.passingScorePct ?? 70,
        exam_question_count: body.examQuestionCount ?? 30,
        unlock_threshold_pct: body.unlockThresholdPct ?? 80,
      }, { onConflict: 'slug' })
      .select('id')
      .single();
    if (cErr || !course) {
      const status = /row-level security/i.test(cErr?.message || '') ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: cErr?.message }) };
    }

    if (Array.isArray(body.segments) && body.segments.length > 0) {
      const rows = body.segments.map((s: any) => ({
        course_id: course.id,
        num: s.num,
        slug: s.slug,
        title_ar: s.titleAr,
        title_en: s.titleEn,
        description_ar: s.descriptionAr ?? null,
        description_en: s.descriptionEn ?? null,
        duration_sec: s.durationSec ?? 0,
        intro_vimeo_id:   s.vimeo?.introId   || null,
        content_vimeo_id: s.vimeo?.contentId || null,
        outro_vimeo_id:   s.vimeo?.outroId   || null,
        intro_duration_sec: s.introDurationSec ?? null,
        outro_duration_sec: s.outroDurationSec ?? null,
        next_title_ar: s.nextTitleAr ?? null,
        next_title_en: s.nextTitleEn ?? null,
        quiz: s.quiz ?? [],
      }));
      const { error: sErr } = await supabase
        .from('course_segments')
        .upsert(rows, { onConflict: 'course_id,num' });
      if (sErr) {
        const status = /row-level security/i.test(sErr.message) ? 403 : 500;
        return { statusCode: status, body: JSON.stringify({ error: sErr.message }) };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ id: course.id }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};

function camelCourse(r: any) {
  return {
    id: r.id, slug: r.slug,
    titleAr: r.title_ar, titleEn: r.title_en,
    descriptionAr: r.description_ar, descriptionEn: r.description_en,
    language: r.language,
    passingScorePct: r.passing_score_pct,
    examQuestionCount: r.exam_question_count,
    unlockThresholdPct: r.unlock_threshold_pct,
    createdAt: r.created_at,
  };
}
function camelSegment(r: any) {
  return {
    id: r.id, num: r.num, slug: r.slug,
    titleAr: r.title_ar, titleEn: r.title_en,
    descriptionAr: r.description_ar, descriptionEn: r.description_en,
    durationSec: Number(r.duration_sec),
    vimeo: { introId: r.intro_vimeo_id, contentId: r.content_vimeo_id, outroId: r.outro_vimeo_id },
    introDurationSec: r.intro_duration_sec ? Number(r.intro_duration_sec) : null,
    outroDurationSec: r.outro_duration_sec ? Number(r.outro_duration_sec) : null,
    nextTitleAr: r.next_title_ar, nextTitleEn: r.next_title_en,
    quiz: r.quiz,
  };
}
```

- [ ] **Step 3: Test the function end-to-end against the live DB**

```bash
cd "/home/karem/projects/tornix test/Tornix.Accreditation"
npm run dev   # starts netlify dev on localhost:8888
```

In another terminal:

```bash
curl -s http://localhost:8888/api/segmented-courses | jq .
curl -s http://localhost:8888/api/segmented-courses/tcp | jq '.course.slug, (.segments | length)'
```

Expected: list returns `[{id:1, slug:"tcp", ...}]`; detail returns `"tcp"` and `22`.

- [ ] **Step 4: Stop `netlify dev` and commit**

```bash
git add netlify/functions/segmented-courses.ts netlify.toml
git commit -m "feat(api): add segmented-courses function"
```

---

## Task 8: Netlify Function — `progress.ts`

GET my progress for a course; POST upsert one row.

**Files:**
- Create: `netlify/functions/progress.ts`
- Modify: `netlify.toml`

- [ ] **Step 1: Add redirects**

Append to `netlify.toml`:

```toml
[[redirects]]
  from = "/api/progress"
  to = "/.netlify/functions/progress"
  status = 200

[[redirects]]
  from = "/api/progress/:courseSlug"
  to = "/.netlify/functions/progress?courseSlug=:courseSlug"
  status = 200
```

- [ ] **Step 2: Create `netlify/functions/progress.ts`**

```ts
import type { Handler } from '@netlify/functions';
import { clientFor, getSession } from '../lib/supabase';

// GET  /api/progress/:courseSlug  -> caller's progress for the course
// POST /api/progress              -> upsert one row {segmentId, clipKind, positionSec, completedAt?}

export const handler: Handler = async (event) => {
  const session = await getSession(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

  const supabase = clientFor(event);

  if (event.httpMethod === 'GET') {
    const slug = event.queryStringParameters?.courseSlug;
    if (!slug) return { statusCode: 400, body: JSON.stringify({ error: 'courseSlug required' }) };

    // 1. Resolve course → segment ids
    const { data: course, error: cErr } = await supabase
      .from('segmented_courses').select('id').eq('slug', slug).single();
    if (cErr || !course) return { statusCode: 404, body: JSON.stringify({ error: 'course not found' }) };

    const { data: segs, error: sErr } = await supabase
      .from('course_segments').select('id').eq('course_id', course.id);
    if (sErr) return { statusCode: 500, body: JSON.stringify({ error: sErr.message }) };

    const ids = (segs || []).map((r: any) => r.id);
    if (ids.length === 0) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    // 2. Fetch caller's progress (RLS limits to own rows)
    const { data, error } = await supabase
      .from('segment_progress')
      .select('segment_id, clip_kind, position_sec, completed_at, updated_at')
      .in('segment_id', ids);
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify((data || []).map((r: any) => ({
        segmentId: r.segment_id,
        clipKind: r.clip_kind,
        positionSec: Number(r.position_sec),
        completedAt: r.completed_at,
        updatedAt: r.updated_at,
      }))),
    };
  }

  if (event.httpMethod === 'POST') {
    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

    const segId = Number(body.segmentId);
    const kind = body.clipKind;
    const pos = Number(body.positionSec);
    if (!segId || !['intro','content','outro'].includes(kind) || !Number.isFinite(pos)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'segmentId, clipKind, positionSec required' }) };
    }

    const row = {
      user_id: session.userId,
      segment_id: segId,
      clip_kind: kind,
      position_sec: pos,
      completed_at: body.completedAt || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('segment_progress')
      .upsert(row, { onConflict: 'user_id,segment_id,clip_kind' });
    if (error) {
      const status = /row-level security/i.test(error.message) ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: error.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};
```

- [ ] **Step 3: Smoke test with `netlify dev`**

```bash
npm run dev
```

Sign in via the existing app at `http://localhost:8888`, then in DevTools console:

```js
const tok = (await window.supabase.auth.getSession()).data.session.access_token;
const r = await fetch('/api/progress/tcp', { headers: { Authorization: `Bearer ${tok}` } });
console.log(await r.json());  // expect []
const w = await fetch('/api/progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
  body: JSON.stringify({ segmentId: 1, clipKind: 'intro', positionSec: 12.5 }),
});
console.log(await w.json());  // expect { ok: true }
```

(If `window.supabase` isn't exposed, find the session token via Supabase auth state hook in React DevTools, or temporarily expose it in `src/supabase.ts`: `(window as any).supabase = supabase`.)

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/progress.ts netlify.toml
git commit -m "feat(api): add progress function for segmented courses"
```

---

## Task 9: Netlify Function — `transcript.ts`

Serves a per-segment slice of the Whisper transcript for the "النص الكامل" tab.

**Files:**
- Create: `netlify/functions/transcript.ts`
- Create: `netlify/functions/transcript-data/whisper_segments.json` (copy of the file)
- Modify: `netlify.toml`

- [ ] **Step 1: Copy the whisper transcript into the repo**

```bash
cp "/home/karem/side projects/hyperframe/work/transcript/whisper_segments.json" \
   "/home/karem/projects/tornix test/Tornix.Accreditation/netlify/functions/transcript-data/whisper_segments.json"
```

Create the directory first if needed:

```bash
mkdir -p "/home/karem/projects/tornix test/Tornix.Accreditation/netlify/functions/transcript-data"
```

- [ ] **Step 2: Add redirect**

Append to `netlify.toml`:

```toml
[[redirects]]
  from = "/api/transcript/:slug"
  to = "/.netlify/functions/transcript?slug=:slug"
  status = 200
```

- [ ] **Step 3: Create `netlify/functions/transcript.ts`**

```ts
import type { Handler } from '@netlify/functions';
import { clientFor, getSession } from '../lib/supabase';
import whisperData from './transcript-data/whisper_segments.json';

interface WhisperSegment {
  id: number; start: number; end: number; text: string;
}
const WHISPER: { segments: WhisperSegment[] } = whisperData as any;

export const handler: Handler = async (event) => {
  const session = await getSession(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const slug = event.queryStringParameters?.slug;
  if (!slug) return { statusCode: 400, body: JSON.stringify({ error: 'slug required' }) };

  // Look up segment time range from course_segments table.
  // We need source_start / source_end — these are not currently in course_segments.
  // For v1 we read them from the original manifest by slug; for future use, add
  // source_start/source_end columns to course_segments and migrate the data.
  //
  // Workaround: query the duration and reconstruct from manifest copy below.
  // To keep this simple, we bundle a slim slug→{start,end} map here.

  const sourceRanges = SOURCE_RANGES; // see bottom of file
  const range = sourceRanges[slug];
  if (!range) return { statusCode: 404, body: JSON.stringify({ error: 'unknown slug' }) };

  const sentences = WHISPER.segments
    .filter(s => s.end > range.start && s.start < range.end)
    .map(s => ({
      // express times relative to the content clip's start
      start: Math.max(0, s.start - range.start),
      end: Math.min(range.end - range.start, s.end - range.start),
      text: s.text.trim(),
    }))
    .filter(s => s.text.length > 0);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentences }),
  };
};

// Populated from /home/karem/side projects/hyperframe/work/segments/manifest.json
// Keep in sync if the manifest changes.
const SOURCE_RANGES: Record<string, { start: number; end: number }> = {
  'tcp-01': { start:  514.0, end:  801.0 },
  'tcp-02': { start:  801.0, end: 1201.0 },
  'tcp-03': { start: 1201.0, end: 1614.0 },
  'tcp-04': { start: 1802.0, end: 2205.0 },
  'tcp-05': { start: 2205.0, end: 2723.0 },
  'tcp-06': { start: 2723.0, end: 3018.0 },
  // TODO: fill the remaining 16 from manifest.json before deploy
  // The engineer must read manifest.json and paste source_start/source_end for tcp-07..tcp-22 here.
};
```

**Implementer note:** Open `/home/karem/side projects/hyperframe/work/segments/manifest.json` and copy the `source_start` / `source_end` values for `tcp-07` through `tcp-22` into `SOURCE_RANGES`. Don't skip this — if a slug isn't in the map the transcript tab returns 404 for that segment.

- [ ] **Step 4: Fill in `SOURCE_RANGES` for tcp-07 through tcp-22**

Read the manifest:

```bash
node -e "const m=JSON.parse(require('fs').readFileSync('/home/karem/side projects/hyperframe/work/segments/manifest.json')); m.segments.forEach(s => console.log(\`  '\${s.slug}': { start: \${s.source_start}, end: \${s.source_end} },\`))"
```

Paste the printed lines into `SOURCE_RANGES`, replacing the `// TODO` block.

- [ ] **Step 5: Configure TypeScript for JSON import**

Edit `tsconfig.json` and add (inside `compilerOptions`):

```json
"resolveJsonModule": true
```

- [ ] **Step 6: Smoke test**

```bash
npm run dev
```

In DevTools console after signing in:

```js
const tok = (await window.supabase.auth.getSession()).data.session.access_token;
const r = await fetch('/api/transcript/tcp-01', { headers: { Authorization: `Bearer ${tok}` } });
const j = await r.json();
console.log(j.sentences.length, j.sentences[0]);
```

Expected: a positive count and a `{start, end, text}` object with Arabic text.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/transcript.ts netlify/functions/transcript-data/ netlify.toml tsconfig.json
git commit -m "feat(api): add transcript slice function"
```

---

## Task 10: Extend `src/api.ts`

Add the client-side types and fetch wrappers.

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Append to `src/api.ts`**

After the existing `sendAssessmentEmail` definition, append:

```ts
// ----- Segmented courses -----------------------------------------
export interface QuizQuestion {
  id?: string;
  q_ar: string; q_en: string;
  choices_ar: string[]; choices_en: string[];
  answer: number;
}
export interface SegmentedCourse {
  id: number;
  slug: string;
  titleAr: string; titleEn: string;
  descriptionAr: string | null; descriptionEn: string | null;
  language: 'ar' | 'en';
  passingScorePct: number;
  examQuestionCount: number;
  unlockThresholdPct: number;
  createdAt: string;
}
export interface CourseSegment {
  id: number;
  num: number;
  slug: string;
  titleAr: string; titleEn: string;
  descriptionAr: string | null; descriptionEn: string | null;
  durationSec: number;
  vimeo: { introId: string | null; contentId: string | null; outroId: string | null };
  introDurationSec: number | null;
  outroDurationSec: number | null;
  nextTitleAr: string | null; nextTitleEn: string | null;
  quiz: QuizQuestion[];
}

export const listSegmentedCourses = (): Promise<Array<{ id: number; slug: string; titleAr: string; titleEn: string; createdAt: string }>> =>
  jsonFetch('/api/segmented-courses');

export const fetchSegmentedCourse = (slug: string): Promise<{ course: SegmentedCourse; segments: CourseSegment[] }> =>
  jsonFetch(`/api/segmented-courses/${encodeURIComponent(slug)}`);

export const upsertSegmentedCourse = (payload: {
  slug: string; titleAr: string; titleEn: string;
  descriptionAr?: string; descriptionEn?: string;
  language?: 'ar' | 'en';
  passingScorePct?: number; examQuestionCount?: number; unlockThresholdPct?: number;
  segments?: Array<Omit<CourseSegment, 'id'>>;
}): Promise<{ id: number }> =>
  jsonFetch('/api/segmented-courses', { method: 'POST', body: JSON.stringify(payload) });

// ----- Progress -----
export type ClipKind = 'intro' | 'content' | 'outro';
export interface ProgressRow {
  segmentId: number;
  clipKind: ClipKind;
  positionSec: number;
  completedAt: string | null;
  updatedAt: string;
}
export const fetchMyProgress = (courseSlug: string): Promise<ProgressRow[]> =>
  jsonFetch(`/api/progress/${encodeURIComponent(courseSlug)}`);

export const upsertProgress = (payload: {
  segmentId: number;
  clipKind: ClipKind;
  positionSec: number;
  completedAt?: string;
}): Promise<{ ok: true }> =>
  jsonFetch('/api/progress', { method: 'POST', body: JSON.stringify(payload) });

// Beacon-friendly variant: returns true if accepted by the browser.
// Use during `beforeunload` so the final write is not lost.
export async function beaconProgress(payload: {
  segmentId: number; clipKind: ClipKind; positionSec: number; completedAt?: string;
}): Promise<boolean> {
  const tok = (await supabase.auth.getSession()).data.session?.access_token;
  if (!tok) return false;
  // sendBeacon doesn't accept custom headers, so we POST to a CORS-friendly variant
  // that reads the token from the body. The function checks both.
  const blob = new Blob([JSON.stringify({ ...payload, _token: tok })], { type: 'application/json' });
  return navigator.sendBeacon('/api/progress', blob);
}

// ----- Transcript -----
export interface TranscriptSentence { start: number; end: number; text: string; }
export const fetchTranscript = (slug: string): Promise<{ sentences: TranscriptSentence[] }> =>
  jsonFetch(`/api/transcript/${encodeURIComponent(slug)}`);
```

- [ ] **Step 2: Update `progress.ts` Function to accept `_token` body fallback for sendBeacon**

Modify `netlify/functions/progress.ts` POST handler. Before the `getSession` call (which reads from headers), add:

```ts
// Allow sendBeacon clients to supply the JWT in the body since sendBeacon
// has no headers API. Strip _token before validation.
let body: any;
try { body = JSON.parse(event.body || '{}'); }
catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }
const beaconToken: string | undefined = body._token;
if (beaconToken && !event.headers.authorization) {
  event.headers = { ...event.headers, authorization: `Bearer ${beaconToken}` };
}
delete body._token;
```

Then move the existing `let body: any; try { body = JSON.parse(event.body || '{}'); ...` block to use this `body` (don't re-parse). The full POST handler becomes:

```ts
if (event.httpMethod === 'POST') {
  let body: any;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

  // Beacon fallback: token in body
  const beaconToken: string | undefined = body._token;
  if (beaconToken && !event.headers.authorization) {
    event.headers = { ...event.headers, authorization: `Bearer ${beaconToken}` };
  }
  delete body._token;

  // Re-resolve session now that auth header may have been injected
  const sess2 = await getSession(event);
  if (!sess2) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

  const segId = Number(body.segmentId);
  const kind = body.clipKind;
  const pos = Number(body.positionSec);
  if (!segId || !['intro','content','outro'].includes(kind) || !Number.isFinite(pos)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'segmentId, clipKind, positionSec required' }) };
  }

  const supabase2 = clientFor(event);
  const row = {
    user_id: sess2.userId,
    segment_id: segId,
    clip_kind: kind,
    position_sec: pos,
    completed_at: body.completedAt || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase2
    .from('segment_progress')
    .upsert(row, { onConflict: 'user_id,segment_id,clip_kind' });
  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500;
    return { statusCode: status, body: JSON.stringify({ error: error.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
```

Note: move the original `const session = await getSession(event);` and `const supabase = clientFor(event);` so they only run for the GET branch (or keep them at top and add the re-resolution as shown).

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no new errors versus `/tmp/lint-baseline.txt`.

- [ ] **Step 4: Commit**

```bash
git add src/api.ts netlify/functions/progress.ts
git commit -m "feat(api): client extensions for segmented courses + beacon progress"
```

---

## Task 11: Player reducer (TDD)

The reducer is the brain of the player. Pure function — TDD it.

**Files:**
- Create: `src/components/segmentedCoursePlayer/reducer.ts`
- Create: `src/components/segmentedCoursePlayer/reducer.test.ts`

- [ ] **Step 1: Create the test file FIRST**

`src/components/segmentedCoursePlayer/reducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reducer, initialState, type State, type Action } from './reducer';

function s(overrides: Partial<State> = {}): State {
  return { ...initialState, segmentCount: 22, ...overrides };
}

describe('player reducer', () => {
  it('SEG_LOAD sets current segment and starts at intro', () => {
    const out = reducer(s(), { type: 'SEG_LOAD', segmentNum: 5 });
    expect(out.currentSegmentNum).toBe(5);
    expect(out.currentClipKind).toBe('intro');
    expect(out.playerState).toBe('loading');
    expect(out.upNext).toBeNull();
  });

  it('CLIP_PLAYING transitions to playing', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'intro', playerState: 'loading' });
    expect(reducer(start, { type: 'CLIP_PLAYING' }).playerState).toBe('playing');
  });

  it('intro CLIP_ENDED → content state', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'intro', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'intro' });
    expect(out.currentClipKind).toBe('content');
    expect(out.upNext).toBeNull();
  });

  it('content CLIP_ENDED → outro state and starts upNext countdown', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'content', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'content' });
    expect(out.currentClipKind).toBe('outro');
    expect(out.upNext).toEqual({ countdownSec: 5, cancelled: false });
  });

  it('outro CLIP_ENDED on a non-final segment → SEG_LOAD(num+1) implicitly', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'outro', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'outro' });
    expect(out.currentSegmentNum).toBe(2);
    expect(out.currentClipKind).toBe('intro');
    expect(out.upNext).toBeNull();
  });

  it('outro CLIP_ENDED on the final segment → course_complete', () => {
    const start = s({ currentSegmentNum: 22, currentClipKind: 'outro', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'outro' });
    expect(out.currentSegmentNum).toBe(22);
    expect(out.playerState).toBe('course_complete');
  });

  it('SKIP_INTRO during intro → content state, no auto-advance from outro yet', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'intro', playerState: 'playing' });
    const out = reducer(start, { type: 'SKIP_INTRO' });
    expect(out.currentClipKind).toBe('content');
  });

  it('UP_NEXT_TICK decrements countdown', () => {
    const start = s({
      currentSegmentNum: 1, currentClipKind: 'outro', playerState: 'playing',
      upNext: { countdownSec: 3, cancelled: false },
    });
    expect(reducer(start, { type: 'UP_NEXT_TICK' }).upNext).toEqual({ countdownSec: 2, cancelled: false });
  });

  it('UP_NEXT_CANCEL sets cancelled flag', () => {
    const start = s({
      currentSegmentNum: 1, currentClipKind: 'outro',
      upNext: { countdownSec: 4, cancelled: false },
    });
    expect(reducer(start, { type: 'UP_NEXT_CANCEL' }).upNext).toEqual({ countdownSec: 4, cancelled: true });
  });

  it('GOTO jumps to arbitrary segment/clip', () => {
    const out = reducer(s({ currentSegmentNum: 1 }), { type: 'GOTO', segmentNum: 7, clipKind: 'content' });
    expect(out.currentSegmentNum).toBe(7);
    expect(out.currentClipKind).toBe('content');
    expect(out.playerState).toBe('loading');
  });

  it('SET_COUNT updates segmentCount only', () => {
    const out = reducer(s({ segmentCount: 0 }), { type: 'SET_COUNT', segmentCount: 22 });
    expect(out.segmentCount).toBe(22);
    expect(out.currentSegmentNum).toBe(1);  // unchanged
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm run test:run -- src/components/segmentedCoursePlayer/reducer.test.ts
```

Expected: errors like "Cannot find module './reducer'".

- [ ] **Step 3: Implement the reducer**

`src/components/segmentedCoursePlayer/reducer.ts`:

```ts
export type ClipKind = 'intro' | 'content' | 'outro';
export type PlayerState = 'loading' | 'playing' | 'paused' | 'course_complete';

export interface UpNext {
  countdownSec: number;
  cancelled: boolean;
}

export interface State {
  segmentCount: number;        // total segments (e.g. 22)
  currentSegmentNum: number;   // 1..segmentCount
  currentClipKind: ClipKind;
  playerState: PlayerState;
  upNext: UpNext | null;
}

export type Action =
  | { type: 'SET_COUNT'; segmentCount: number }
  | { type: 'SEG_LOAD'; segmentNum: number }
  | { type: 'CLIP_PLAYING' }
  | { type: 'CLIP_PAUSED' }
  | { type: 'CLIP_ENDED'; kind: ClipKind }
  | { type: 'SKIP_INTRO' }
  | { type: 'UP_NEXT_TICK' }
  | { type: 'UP_NEXT_CANCEL' }
  | { type: 'GOTO'; segmentNum: number; clipKind: ClipKind };

export const initialState: State = {
  segmentCount: 0,
  currentSegmentNum: 1,
  currentClipKind: 'intro',
  playerState: 'loading',
  upNext: null,
};

const UP_NEXT_SECONDS = 5;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_COUNT':
      return { ...state, segmentCount: action.segmentCount };

    case 'SEG_LOAD':
      return {
        ...state,
        currentSegmentNum: action.segmentNum,
        currentClipKind: 'intro',
        playerState: 'loading',
        upNext: null,
      };

    case 'CLIP_PLAYING':
      return { ...state, playerState: 'playing' };

    case 'CLIP_PAUSED':
      return { ...state, playerState: 'paused' };

    case 'CLIP_ENDED': {
      if (action.kind === 'intro') {
        return { ...state, currentClipKind: 'content', upNext: null };
      }
      if (action.kind === 'content') {
        return { ...state, currentClipKind: 'outro', upNext: { countdownSec: UP_NEXT_SECONDS, cancelled: false } };
      }
      // outro ended
      if (state.currentSegmentNum < state.segmentCount) {
        return {
          ...state,
          currentSegmentNum: state.currentSegmentNum + 1,
          currentClipKind: 'intro',
          playerState: 'loading',
          upNext: null,
        };
      }
      return { ...state, playerState: 'course_complete' };
    }

    case 'SKIP_INTRO':
      // Player wrapper is responsible for calling seekTo(intro.duration);
      // the reducer just advances state so the UI updates immediately.
      return { ...state, currentClipKind: 'content', upNext: null };

    case 'UP_NEXT_TICK':
      if (!state.upNext) return state;
      return { ...state, upNext: { ...state.upNext, countdownSec: Math.max(0, state.upNext.countdownSec - 1) } };

    case 'UP_NEXT_CANCEL':
      if (!state.upNext) return state;
      return { ...state, upNext: { ...state.upNext, cancelled: true } };

    case 'GOTO':
      return {
        ...state,
        currentSegmentNum: action.segmentNum,
        currentClipKind: action.clipKind,
        playerState: 'loading',
        upNext: null,
      };

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
npm run test:run -- src/components/segmentedCoursePlayer/reducer.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/segmentedCoursePlayer/
git commit -m "feat(player): reducer for chained playback state machine"
```

---

## Task 12: Helper utilities (TDD)

Pure helpers used by the component.

**Files:**
- Create: `src/components/segmentedCoursePlayer/helpers.ts`
- Create: `src/components/segmentedCoursePlayer/helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/segmentedCoursePlayer/helpers.test.ts
import { describe, it, expect } from 'vitest';
import {
  clipDurationFor, isClipComplete, completedSegments, examUnlocked, resumePoint,
} from './helpers';
import type { CourseSegment, ProgressRow } from '@/src/api';

const seg = (over: Partial<CourseSegment>): CourseSegment => ({
  id: 1, num: 1, slug: 'tcp-01',
  titleAr: '', titleEn: '', descriptionAr: null, descriptionEn: null,
  durationSec: 300, vimeo: { introId: 'i', contentId: 'c', outroId: 'o' },
  introDurationSec: 5, outroDurationSec: 5,
  nextTitleAr: null, nextTitleEn: null, quiz: [],
  ...over,
});

describe('clipDurationFor', () => {
  it('returns intro/outro duration from the segment fields', () => {
    expect(clipDurationFor(seg({ introDurationSec: 5 }), 'intro')).toBe(5);
    expect(clipDurationFor(seg({ outroDurationSec: 7 }), 'outro')).toBe(7);
  });
  it('content duration = total - intro - outro', () => {
    expect(clipDurationFor(seg({ durationSec: 300, introDurationSec: 5, outroDurationSec: 5 }), 'content')).toBe(290);
  });
});

describe('isClipComplete', () => {
  it('true when position >= 0.95 * duration', () => {
    expect(isClipComplete(95, 100)).toBe(true);
    expect(isClipComplete(94.99, 100)).toBe(false);
  });
  it('false for zero duration (avoid div-by-zero)', () => {
    expect(isClipComplete(10, 0)).toBe(false);
  });
});

describe('completedSegments', () => {
  it('counts segments where all 3 clips are completed', () => {
    const segments = [seg({ id: 1 }), seg({ id: 2 }), seg({ id: 3 })];
    const progress: ProgressRow[] = [
      { segmentId: 1, clipKind: 'intro',   positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 1, clipKind: 'content', positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 1, clipKind: 'outro',   positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 2, clipKind: 'intro',   positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 2, clipKind: 'content', positionSec: 0, completedAt: null, updatedAt: 'x' },
    ];
    expect(completedSegments(segments, progress)).toBe(1);
  });
});

describe('examUnlocked', () => {
  it('unlocked when completed/total >= threshold/100', () => {
    expect(examUnlocked(18, 22, 80)).toBe(true);   // 81.8%
    expect(examUnlocked(17, 22, 80)).toBe(false);  // 77.3%
    expect(examUnlocked(0, 22, 80)).toBe(false);
  });
});

describe('resumePoint', () => {
  it('returns the most recently updated non-completed clip', () => {
    const segments = [seg({ id: 1 }), seg({ id: 2 })];
    const progress: ProgressRow[] = [
      { segmentId: 1, clipKind: 'content', positionSec: 50, completedAt: null, updatedAt: '2026-05-10T10:00:00Z' },
      { segmentId: 2, clipKind: 'intro',   positionSec: 2,  completedAt: null, updatedAt: '2026-05-11T10:00:00Z' },
    ];
    expect(resumePoint(segments, progress)).toEqual({ segmentNum: 2, clipKind: 'intro', positionSec: 2 });
  });
  it('returns null when no progress at all', () => {
    expect(resumePoint([seg({})], [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
npm run test:run -- src/components/segmentedCoursePlayer/helpers.test.ts
```

- [ ] **Step 3: Implement `helpers.ts`**

```ts
import type { ClipKind, CourseSegment, ProgressRow } from '@/src/api';

export function clipDurationFor(seg: CourseSegment, kind: ClipKind): number {
  if (kind === 'intro') return seg.introDurationSec ?? 0;
  if (kind === 'outro') return seg.outroDurationSec ?? 0;
  return Math.max(0, seg.durationSec - (seg.introDurationSec ?? 0) - (seg.outroDurationSec ?? 0));
}

export function isClipComplete(positionSec: number, durationSec: number): boolean {
  if (durationSec <= 0) return false;
  return positionSec >= 0.95 * durationSec;
}

export function completedSegments(segments: CourseSegment[], progress: ProgressRow[]): number {
  const bySeg = new Map<number, Set<ClipKind>>();
  for (const p of progress) {
    if (!p.completedAt) continue;
    if (!bySeg.has(p.segmentId)) bySeg.set(p.segmentId, new Set());
    bySeg.get(p.segmentId)!.add(p.clipKind);
  }
  let count = 0;
  for (const s of segments) {
    const set = bySeg.get(s.id);
    if (set && set.has('intro') && set.has('content') && set.has('outro')) count++;
  }
  return count;
}

export function examUnlocked(completed: number, total: number, thresholdPct: number): boolean {
  if (total <= 0) return false;
  return (completed / total) * 100 >= thresholdPct;
}

export function resumePoint(
  segments: CourseSegment[],
  progress: ProgressRow[]
): { segmentNum: number; clipKind: ClipKind; positionSec: number } | null {
  if (progress.length === 0) return null;
  const segById = new Map(segments.map(s => [s.id, s.num]));
  const incomplete = progress.filter(p => !p.completedAt);
  if (incomplete.length === 0) {
    // user finished everything; resume to the last segment outro for context
    const lastCompleted = [...progress].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return { segmentNum: segById.get(lastCompleted.segmentId) ?? 1, clipKind: lastCompleted.clipKind, positionSec: 0 };
  }
  const latest = incomplete.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    segmentNum: segById.get(latest.segmentId) ?? 1,
    clipKind: latest.clipKind,
    positionSec: latest.positionSec,
  };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm run test:run -- src/components/segmentedCoursePlayer/helpers.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/segmentedCoursePlayer/helpers.ts src/components/segmentedCoursePlayer/helpers.test.ts
git commit -m "feat(player): helpers for clip duration, completion, exam unlock, resume"
```

---

## Task 13: Throttle utility (TDD)

The progress writer needs a leading-edge-disabled trailing throttle so we don't burn writes on every `timeupdate`.

**Files:**
- Create: `src/lib/throttle.ts`
- Create: `src/lib/throttle.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/throttle.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle (trailing, no leading)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT call on first invocation', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls once after the interval with the latest argument', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1); t(2); t(3);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  it('flush() invokes immediately with the latest argument', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(7);
    t.flush();
    expect(fn).toHaveBeenCalledWith(7);
  });

  it('cancel() prevents pending invocation', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1);
    t.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
npm run test:run -- src/lib/throttle.test.ts
```

- [ ] **Step 3: Implement `src/lib/throttle.ts`**

```ts
export interface ThrottledFn<T extends any[]> {
  (...args: T): void;
  flush(): void;
  cancel(): void;
}

export function throttle<T extends any[]>(fn: (...args: T) => void, intervalMs: number): ThrottledFn<T> {
  let pending: { args: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    if (pending) {
      const args = pending.args;
      pending = null;
      fn(...args);
    }
  };

  const t = ((...args: T) => {
    pending = { args };
    if (timer === null) {
      timer = setTimeout(fire, intervalMs);
    }
  }) as ThrottledFn<T>;

  t.flush = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (pending) {
      const args = pending.args; pending = null;
      fn(...args);
    }
  };
  t.cancel = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    pending = null;
  };
  return t;
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/throttle.ts src/lib/throttle.test.ts
git commit -m "feat(lib): trailing throttle with flush + cancel"
```

---

## Task 14: Install `@vimeo/player`

```bash
npm install @vimeo/player
npm install --save-dev @types/vimeo__player
```

- [ ] **Step 1: Verify install**

```bash
node -e "console.log(require('@vimeo/player'))"
```

Expected: prints a class object.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add @vimeo/player"
```

---

## Task 15: `SegmentedCourseViewer` skeleton

Component shell with layout, fetching, sidebar; iframes not yet wired.

**Files:**
- Create: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React, { useEffect, useReducer, useState } from 'react';
import { X, PlayCircle, Lock, Sparkles, FileText } from 'lucide-react';
import {
  fetchSegmentedCourse, fetchMyProgress,
  type SegmentedCourse, type CourseSegment, type ProgressRow,
} from '../api';
import { reducer, initialState, type State } from './segmentedCoursePlayer/reducer';
import { completedSegments, examUnlocked } from './segmentedCoursePlayer/helpers';

interface Props {
  lang: 'ar' | 'en';
  courseSlug: string;
  onClose: () => void;
  onStartExam: () => void;
}

export const SegmentedCourseViewer: React.FC<Props> = ({ lang, courseSlug, onClose, onStartExam }) => {
  const isAr = lang === 'ar';
  const [course, setCourse] = useState<SegmentedCourse | null>(null);
  const [segments, setSegments] = useState<CourseSegment[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [bottomTab, setBottomTab] = useState<'overview' | 'transcript' | 'resources'>('overview');

  // Initial fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [det, prog] = await Promise.all([
          fetchSegmentedCourse(courseSlug),
          fetchMyProgress(courseSlug).catch(() => [] as ProgressRow[]),
        ]);
        if (!alive) return;
        setCourse(det.course);
        setSegments(det.segments);
        setProgress(prog);
        // Set segmentCount FIRST so CLIP_ENDED on outro knows whether to advance or course-complete
        dispatch({ type: 'SET_COUNT', segmentCount: det.segments.length });
        dispatch({ type: 'SEG_LOAD', segmentNum: 1 });
      } catch (e: any) {
        if (alive) setLoadErr(e?.message || 'load failed');
      }
    })();
    return () => { alive = false; };
  }, [courseSlug]);

  if (loadErr) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'var(--bg)' }}>
        <div className="card p-6 text-center max-w-md">
          <strong className="text-h3 block mb-2">{isAr ? 'تعذّر تحميل الكورس' : 'Failed to load course'}</strong>
          <p className="text-body-m mb-4" style={{ color: 'var(--text-muted)' }}>{loadErr}</p>
          <button className="btn btn-primary btn-md" onClick={() => location.reload()}>
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'var(--bg)' }}>
        <span className="inline-block w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-hairline)', borderTopColor: 'var(--primary)' }} />
      </div>
    );
  }

  const currentSeg: CourseSegment | undefined = segments[state.currentSegmentNum - 1];
  const completed = completedSegments(segments, progress);
  const unlocked = examUnlocked(completed, segments.length, course.unlockThresholdPct);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)', direction: isAr ? 'rtl' : 'ltr' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 px-5 md:px-8 h-16 flex items-center justify-between"
           style={{ background: 'var(--nav-bg)', borderBottom: '1px solid var(--border-hairline)' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
          <strong className="text-h4">{isAr ? course.titleAr : course.titleEn}</strong>
          <span className="text-caption" style={{ color: 'var(--text-muted)' }}>
            {state.currentSegmentNum} / {segments.length}
          </span>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">
          <X className="w-4 h-4" />
          {isAr ? 'إغلاق' : 'Close'}
        </button>
      </div>

      <div className="p-5 md:p-8">
        <div className="max-w-6xl mx-auto flex flex-col xl:flex-row gap-6">
          {/* Center column: player + tabs */}
          <div className="flex-1 min-w-0">
            <div className="rounded-2xl overflow-hidden mb-5 aspect-video relative"
                 style={{ background: '#0F172A', border: '1px solid var(--border-hairline)' }}>
              {currentSeg ? (
                <div className="w-full h-full grid place-items-center text-white text-body-m">
                  {/* TODO Task 16-17: replace with three Vimeo iframes */}
                  Segment {currentSeg.num} • {state.currentClipKind}
                </div>
              ) : (
                <div className="w-full h-full grid place-items-center text-white">…</div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-3 mb-3">
              {(['overview','transcript','resources'] as const).map(t => (
                <button key={t}
                  onClick={() => setBottomTab(t)}
                  className={`btn btn-sm ${bottomTab === t ? 'btn-primary' : 'btn-ghost'}`}>
                  {isAr
                    ? (t === 'overview' ? 'نظرة عامة' : t === 'transcript' ? 'النص الكامل' : 'الموارد')
                    : (t === 'overview' ? 'Overview' : t === 'transcript' ? 'Transcript' : 'Resources')}
                </button>
              ))}
            </div>

            <div className="card p-5">
              {bottomTab === 'overview' && currentSeg && (
                <p className="text-body-m leading-relaxed">
                  {isAr ? currentSeg.descriptionAr : currentSeg.descriptionEn}
                </p>
              )}
              {bottomTab === 'transcript' && (
                <p className="text-body-m" style={{ color: 'var(--text-muted)' }}>
                  {/* TODO Task 22: fetch + render */}
                  {isAr ? 'يتم التحميل…' : 'Loading…'}
                </p>
              )}
              {bottomTab === 'resources' && (
                <p className="text-body-m" style={{ color: 'var(--text-muted)' }}>{isAr ? 'قريبًا' : 'Coming soon'}</p>
              )}
            </div>
          </div>

          {/* Right rail (RTL: left side): curriculum */}
          <aside className="xl:w-[320px] shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-label flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isAr ? `المنهج (${completed}/${segments.length})` : `Curriculum (${completed}/${segments.length})`}
              </span>
            </div>
            <div className="space-y-2 mb-5">
              {segments.map(seg => {
                const segProg = progress.filter(p => p.segmentId === seg.id);
                const completedKinds = new Set(segProg.filter(p => p.completedAt).map(p => p.clipKind));
                const isActive = seg.num === state.currentSegmentNum;
                return (
                  <button key={seg.id}
                    onClick={() => dispatch({ type: 'GOTO', segmentNum: seg.num, clipKind: 'intro' })}
                    className="w-full text-start card card-tight p-3 transition-colors"
                    style={{
                      background: isActive ? 'var(--primary-wash)' : 'var(--card)',
                      borderColor: isActive ? 'var(--primary)' : 'var(--border-hairline)',
                    }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-h4">{seg.num}. {isAr ? seg.titleAr : seg.titleEn}</span>
                      <span className="text-caption" style={{ color: 'var(--text-muted)' }}>
                        {(['intro','content','outro'] as const).map(k => (
                          <span key={k} className="inline-block w-2 h-2 rounded-full mx-0.5"
                                style={{ background: completedKinds.has(k) ? 'var(--completed)' : 'var(--border-hairline)' }} />
                        ))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              disabled={!unlocked}
              onClick={onStartExam}
              className="btn btn-primary btn-md w-full"
              title={unlocked ? '' : (isAr ? `أكمل ${Math.ceil(course.unlockThresholdPct/100*segments.length)} مقطعًا على الأقل لفتح الاختبار` : 'Complete more segments to unlock the exam')}>
              {unlocked ? null : <Lock className="w-4 h-4" />}
              {isAr ? 'ابدأ الاختبار النهائي' : 'Start final exam'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Mount it temporarily from `App.tsx` for visual smoke**

Find where `CourseViewer` is mounted (line ~1999 of `App.tsx`):

```tsx
{showCourse && <CourseViewer onClose={() => setShowCourse(false)} lang={lang} />}
```

Replace with (temporary for smoke testing — Task 25 will make this a proper integration):

```tsx
{showCourse && <SegmentedCourseViewer
  lang={lang}
  courseSlug="tcp"
  onClose={() => setShowCourse(false)}
  onStartExam={() => { setShowCourse(false); /* TODO Task 25 */ }}
/>}
```

Don't forget the import at the top of `App.tsx`:

```tsx
import { SegmentedCourseViewer } from './components/SegmentedCourseViewer';
```

- [ ] **Step 3: Run dev, open the course viewer, verify shell renders**

```bash
npm run dev
```

Open `http://localhost:8888`, sign in, click whatever opens the course (the existing "Knowledge center"). You should see the new shell with the curriculum sidebar listing 22 segments. The video area shows a placeholder ("Segment 1 • intro").

- [ ] **Step 4: Revert the temporary `App.tsx` change**

Restore the original `CourseViewer` line. We'll re-integrate properly in Task 25.

```bash
git checkout -- src/App.tsx
```

- [ ] **Step 5: Commit the component**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): SegmentedCourseViewer shell + curriculum sidebar"
```

---

## Task 16: Single Vimeo iframe + Player wiring

Wire up `@vimeo/player` for the **content** clip only. Auto-advance not yet — that's Task 17.

**Files:**
- Modify: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Replace the placeholder video block**

In `SegmentedCourseViewer.tsx`, replace the `<div className="w-full h-full grid place-items-center text-white text-body-m">...</div>` placeholder with an iframe + ref:

```tsx
import Vimeo from '@vimeo/player';
// add to existing imports at top

// inside the component:
const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
const playerRef = React.useRef<Vimeo | null>(null);

React.useEffect(() => {
  if (!currentSeg) return;
  const vid = currentSeg.vimeo[state.currentClipKind + 'Id' as 'introId' | 'contentId' | 'outroId'];
  if (!vid) return;
  if (!iframeRef.current) return;

  iframeRef.current.src = `https://player.vimeo.com/video/${vid}?autoplay=1&controls=1&dnt=1`;
  const p = new Vimeo(iframeRef.current);
  playerRef.current = p;
  p.on('play', () => dispatch({ type: 'CLIP_PLAYING' }));
  p.on('pause', () => dispatch({ type: 'CLIP_PAUSED' }));
  p.on('ended', () => dispatch({ type: 'CLIP_ENDED', kind: state.currentClipKind }));

  return () => { p.destroy().catch(() => {}); playerRef.current = null; };
}, [currentSeg?.id, state.currentClipKind]);

// In JSX, replace the placeholder div with:
{currentSeg && (
  <iframe
    ref={iframeRef}
    className="w-full h-full"
    allow="autoplay; fullscreen; picture-in-picture"
    title={isAr ? currentSeg.titleAr : currentSeg.titleEn}
  />
)}
```

- [ ] **Step 2: Lint check**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 3: Manual verify in `netlify dev`**

Visit, open the course (re-apply the temp mount from Task 15 Step 2, **then revert again** after). Pick the segment whose `content_vimeo_id` you uploaded a test clip to. Verify the video plays inline and the sidebar's progress dot toggles when you let the clip finish (intro→content via reducer).

(You may not yet have any uploaded videos. If so, skip the live test and just verify the iframe DOM is constructed correctly with no console errors.)

- [ ] **Step 4: Commit**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): wire @vimeo/player for active clip"
```

---

## Task 17: Three preloaded iframes + chained playback

Swap from one iframe to three preloaded ones (intro/content/outro), toggled by `display:none`. Avoids the init flash between clips.

**Files:**
- Modify: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Replace single iframe with three**

Replace the section from Task 16 with:

```tsx
const introRef = React.useRef<HTMLIFrameElement | null>(null);
const contentRef = React.useRef<HTMLIFrameElement | null>(null);
const outroRef = React.useRef<HTMLIFrameElement | null>(null);
const playersRef = React.useRef<{ intro?: Vimeo; content?: Vimeo; outro?: Vimeo }>({});

// Effect: rebuild all three players when the *segment* changes
React.useEffect(() => {
  if (!currentSeg) return;
  const map = { intro: introRef, content: contentRef, outro: outroRef } as const;
  const ids = {
    intro: currentSeg.vimeo.introId,
    content: currentSeg.vimeo.contentId,
    outro: currentSeg.vimeo.outroId,
  };
  const players: typeof playersRef.current = {};

  for (const kind of ['intro','content','outro'] as const) {
    const iframe = map[kind].current;
    if (!iframe || !ids[kind]) continue;
    iframe.src = `https://player.vimeo.com/video/${ids[kind]}?autoplay=0&controls=1&dnt=1`;
    const p = new Vimeo(iframe);
    p.on('play',  () => dispatch({ type: 'CLIP_PLAYING' }));
    p.on('pause', () => dispatch({ type: 'CLIP_PAUSED' }));
    p.on('ended', () => dispatch({ type: 'CLIP_ENDED', kind }));
    players[kind] = p;
  }
  playersRef.current = players;

  return () => {
    Object.values(players).forEach(p => p?.destroy().catch(() => {}));
    playersRef.current = {};
  };
}, [currentSeg?.id]);

// Effect: when currentClipKind changes, pause the others and play the active one
React.useEffect(() => {
  const players = playersRef.current;
  (['intro','content','outro'] as const).forEach(k => {
    const p = players[k];
    if (!p) return;
    if (k === state.currentClipKind) {
      p.play().catch(() => {/* autoplay blocked — overlay tells user to click */});
    } else {
      p.pause().catch(() => {});
    }
  });
}, [state.currentClipKind]);
```

JSX for the player area:

```tsx
<div className="w-full h-full relative">
  {(['intro','content','outro'] as const).map(kind => {
    const ref = kind === 'intro' ? introRef : kind === 'content' ? contentRef : outroRef;
    const active = state.currentClipKind === kind;
    const vid = currentSeg?.vimeo[kind + 'Id' as 'introId' | 'contentId' | 'outroId'];
    return (
      <iframe
        key={`${currentSeg?.id}-${kind}`}
        ref={ref}
        className="absolute inset-0 w-full h-full"
        style={{ display: active ? 'block' : 'none' }}
        allow="autoplay; fullscreen; picture-in-picture"
        title={`${currentSeg?.slug}-${kind}`}
        // when there's no vimeo id, leave src empty so we don't load junk
        src={vid ? undefined : 'about:blank'}
      />
    );
  })}
  {!currentSeg?.vimeo.contentId && (
    <div className="absolute inset-0 grid place-items-center text-white">
      {isAr ? 'غير متاح بعد' : 'Not available yet'}
    </div>
  )}
</div>
```

- [ ] **Step 2: Lint check**

```bash
npm run lint
```

- [ ] **Step 3: Smoke test** (skip if no Vimeo IDs uploaded yet)

If even one segment has all three Vimeo IDs uploaded, the chain `intro → content → outro` should play seamlessly. Verify by letting intro reach its natural end.

- [ ] **Step 4: Commit**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): three preloaded vimeo iframes with chained playback"
```

---

## Task 18: Skip-intro overlay

**Files:**
- Modify: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Add the overlay**

Inside the player container `<div className="w-full h-full relative">`, after the iframes:

```tsx
{state.currentClipKind === 'intro' && currentSeg?.vimeo.introId && (
  <button
    onClick={() => {
      // seek intro to end, then trigger CLIP_ENDED via reducer for instant UI feedback
      const p = playersRef.current.intro;
      const introDur = currentSeg.introDurationSec ?? 5;
      p?.setCurrentTime(introDur).catch(() => {});
      dispatch({ type: 'SKIP_INTRO' });
    }}
    className="absolute top-3 z-10 px-3 py-1.5 rounded-full text-white text-caption font-semibold"
    style={{ [isAr ? 'right' : 'left']: '12px', background: 'rgba(0,0,0,0.55)' }}>
    {isAr ? 'تخطي المقدمة ›' : 'Skip intro ›'}
  </button>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): skip-intro overlay"
```

---

## Task 19: Up-next overlay + countdown

**Files:**
- Modify: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Add countdown effect + overlay**

Inside the component, after the existing effects, add:

```tsx
// Tick the up-next countdown once per second while in outro and not cancelled
React.useEffect(() => {
  if (!state.upNext || state.upNext.cancelled) return;
  if (state.upNext.countdownSec <= 0) return;
  const t = setTimeout(() => dispatch({ type: 'UP_NEXT_TICK' }), 1000);
  return () => clearTimeout(t);
}, [state.upNext?.countdownSec, state.upNext?.cancelled]);

// When the countdown reaches 0 and not cancelled, simulate clip ending early
React.useEffect(() => {
  if (state.upNext?.countdownSec === 0 && !state.upNext.cancelled) {
    // dispatch CLIP_ENDED for the outro, which the reducer turns into SEG_LOAD(next)
    dispatch({ type: 'CLIP_ENDED', kind: 'outro' });
  }
}, [state.upNext?.countdownSec, state.upNext?.cancelled]);
```

In the player container, after the skip-intro overlay:

```tsx
{state.currentClipKind === 'outro' && currentSeg && state.upNext && (
  <div className="absolute bottom-4 z-10 max-w-[280px] p-3 rounded-xl"
       style={{ [isAr ? 'right' : 'left']: '12px', background: 'rgba(15,23,42,0.85)', color: 'white' }}>
    <div className="text-caption opacity-80 mb-1">
      {isAr ? 'التالي' : 'Up next'}
    </div>
    <div className="text-h4 mb-2 leading-tight">
      {isAr ? currentSeg.nextTitleAr : currentSeg.nextTitleEn}
    </div>
    <div className="flex items-center gap-2">
      {!state.upNext.cancelled ? (
        <>
          <span
            className="inline-block w-7 h-7 rounded-full grid place-items-center text-caption font-bold"
            style={{
              background: `conic-gradient(var(--primary) ${(1 - state.upNext.countdownSec/5)*360}deg, rgba(255,255,255,0.2) 0)`,
            }}
          >
            {state.upNext.countdownSec}
          </span>
          <button onClick={() => dispatch({ type: 'UP_NEXT_CANCEL' })}
                  className="text-caption underline">
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        </>
      ) : (
        <button onClick={() => dispatch({ type: 'CLIP_ENDED', kind: 'outro' })}
                className="btn btn-primary btn-sm">
          {isAr ? 'التالي ›' : 'Next ›'}
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): up-next overlay with countdown ring"
```

---

## Task 20: End-of-course state + exam unlock CTA

The reducer already turns the last outro's `CLIP_ENDED` into `playerState: 'course_complete'`. Now render an overlay celebrating completion and offering the exam.

**Files:**
- Modify: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Add the course-complete overlay**

After the up-next overlay:

```tsx
{state.playerState === 'course_complete' && (
  <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: 'rgba(15,23,42,0.85)' }}>
    <div className="card p-7 text-center max-w-md mx-4">
      <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--primary)' }} />
      <h3 className="text-h2 mb-2">{isAr ? 'أنهيت جميع المقاطع' : 'You finished every segment'}</h3>
      <p className="text-body-m mb-5" style={{ color: 'var(--text-muted)' }}>
        {isAr ? 'جاهز للاختبار النهائي وللحصول على الاعتماد.' : 'Ready for the final exam and certificate.'}
      </p>
      <button className="btn btn-primary btn-md w-full" onClick={onStartExam}>
        {isAr ? 'ابدأ الاختبار النهائي' : 'Start final exam'}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): course-complete overlay with exam CTA"
```

---

## Task 21: Below-video tabs — transcript + resources

**Files:**
- Modify: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Add transcript fetch + render**

Inside the component, add:

```tsx
const [transcript, setTranscript] = useState<{ start: number; end: number; text: string }[]>([]);
const [transcriptErr, setTranscriptErr] = useState<string | null>(null);

useEffect(() => {
  if (bottomTab !== 'transcript' || !currentSeg) return;
  let alive = true;
  setTranscript([]);
  setTranscriptErr(null);
  import('../api').then(api => api.fetchTranscript(currentSeg.slug))
    .then(r => { if (alive) setTranscript(r.sentences); })
    .catch(e => { if (alive) setTranscriptErr(e.message || 'failed'); });
  return () => { alive = false; };
}, [bottomTab, currentSeg?.slug]);
```

In the JSX, replace the transcript tab body with:

```tsx
{bottomTab === 'transcript' && (
  <div className="max-h-96 overflow-y-auto text-body-m leading-relaxed space-y-2">
    {transcriptErr && (
      <p style={{ color: 'var(--sem-red)' }}>{isAr ? 'تعذّر تحميل النص' : 'Failed to load transcript'}</p>
    )}
    {!transcriptErr && transcript.length === 0 && (
      <p style={{ color: 'var(--text-muted)' }}>{isAr ? 'يتم التحميل…' : 'Loading…'}</p>
    )}
    {transcript.map((s, i) => (
      <button
        key={i}
        onClick={() => playersRef.current.content?.setCurrentTime(s.start).catch(() => {})}
        className="block w-full text-start p-2 rounded hover:bg-[var(--bg-alt)]"
        title={`${Math.floor(s.start/60)}:${String(Math.floor(s.start%60)).padStart(2,'0')}`}>
        {s.text}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): transcript tab fetches and renders whisper sentences"
```

---

## Task 22: Throttled progress write + auto-resume

**Files:**
- Modify: `src/components/SegmentedCourseViewer.tsx`

- [ ] **Step 1: Add throttled writer + bind to `timeupdate`**

Add imports:

```tsx
import { upsertProgress, beaconProgress } from '../api';
import { throttle } from '../lib/throttle';
import { clipDurationFor, isClipComplete, resumePoint } from './segmentedCoursePlayer/helpers';
```

Inside the component, after the iframe-effect that constructs players (Task 17 Step 1), replace `p.on('play', ...)` and friends with:

```tsx
for (const kind of ['intro','content','outro'] as const) {
  const iframe = map[kind].current;
  if (!iframe || !ids[kind]) continue;
  iframe.src = `https://player.vimeo.com/video/${ids[kind]}?autoplay=0&controls=1&dnt=1`;
  const p = new Vimeo(iframe);

  const writer = throttle((sec: number) => {
    const completedAt = isClipComplete(sec, clipDurationFor(currentSeg, kind)) ? new Date().toISOString() : undefined;
    upsertProgress({ segmentId: currentSeg.id, clipKind: kind, positionSec: sec, completedAt })
      .then(() => {
        // optimistic local update
        setProgress(prev => {
          const others = prev.filter(r => !(r.segmentId === currentSeg.id && r.clipKind === kind));
          const existing = prev.find(r => r.segmentId === currentSeg.id && r.clipKind === kind);
          return [...others, {
            segmentId: currentSeg.id, clipKind: kind, positionSec: sec,
            completedAt: completedAt ?? existing?.completedAt ?? null,
            updatedAt: new Date().toISOString(),
          }];
        });
      })
      .catch(() => {/* swallow; retry next tick */});
  }, 7000);

  p.on('play',  () => dispatch({ type: 'CLIP_PLAYING' }));
  p.on('pause', () => { dispatch({ type: 'CLIP_PAUSED' }); writer.flush(); });
  p.on('ended', () => {
    p.getDuration().then(d => writer.flush()).catch(() => {});
    dispatch({ type: 'CLIP_ENDED', kind });
  });
  p.on('timeupdate', (e: { seconds: number }) => writer(e.seconds));

  // Auto-resume: if this is the active clip on mount and we have a saved position, seek
  if (kind === state.currentClipKind) {
    const saved = progress.find(r => r.segmentId === currentSeg.id && r.clipKind === kind);
    if (saved && saved.positionSec > 1) {
      p.setCurrentTime(saved.positionSec).catch(() => {});
    }
  }

  players[kind] = p;
}
```

- [ ] **Step 2: Apply `resumePoint` on initial load**

In the initial-fetch effect (Task 15), replace the `dispatch({ type: 'SEG_LOAD', segmentNum: 1 })` line with the resume calculation. Keep the `SET_COUNT` dispatch above it intact:

```tsx
dispatch({ type: 'SET_COUNT', segmentCount: det.segments.length });  // already present from Task 15
const resume = resumePoint(det.segments, prog);
dispatch({
  type: 'GOTO',
  segmentNum: resume?.segmentNum ?? 1,
  clipKind: resume?.clipKind ?? 'intro',
});
```

- [ ] **Step 3: Flush + beacon on unmount and `beforeunload`**

Add at the bottom of the component:

```tsx
// Flush pending writes on unmount
React.useEffect(() => {
  const beforeUnload = () => {
    // we can't await in unload; fire a final beacon for the current player position
    const p = playersRef.current[state.currentClipKind];
    p?.getCurrentTime().then(sec => {
      beaconProgress({
        segmentId: currentSeg!.id,
        clipKind: state.currentClipKind,
        positionSec: sec,
      }).catch(() => {});
    }).catch(() => {});
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => window.removeEventListener('beforeunload', beforeUnload);
}, [currentSeg?.id, state.currentClipKind]);
```

- [ ] **Step 4: Manual smoke**

```bash
npm run dev
```

Play a clip for ~10s, watch the network panel — expect one POST `/api/progress` per ~7s with a 200 response. Close the tab; the final beacon should fire (visible in DevTools "All" filter).

- [ ] **Step 5: Commit**

```bash
git add src/components/SegmentedCourseViewer.tsx
git commit -m "feat(player): throttled progress write + auto-resume + beforeunload beacon"
```

---

## Task 23: 401 handling in `api.ts`

If the user's session expires mid-course, every progress write 401s. Detect and bounce to login.

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Update `jsonFetch` to detect 401 and trigger re-auth**

Replace the existing `jsonFetch` function with:

```ts
async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    // Save last URL so we can return after login, then redirect
    try { sessionStorage.setItem('postLoginReturn', window.location.pathname + window.location.search); } catch {}
    // Defer redirect to next tick so callers can handle errors first if they want
    setTimeout(() => { window.location.assign('/'); }, 0);
  }
  const text = await res.text();
  let data: any = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = data?.error || text || res.statusText;
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return data as T;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api.ts
git commit -m "feat(api): redirect on 401 with return path saved"
```

---

## Task 24: `SegmentedCoursesAdmin` — list + detail + manifest import

**Files:**
- Create: `src/components/SegmentedCoursesAdmin.tsx`
- Modify: `src/components/AdminPanel.tsx`

- [ ] **Step 1: Create the admin component**

```tsx
// src/components/SegmentedCoursesAdmin.tsx
import React, { useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { listSegmentedCourses, fetchSegmentedCourse, upsertSegmentedCourse, type SegmentedCourse, type CourseSegment } from '../api';

interface Props { lang: 'ar' | 'en'; }

type ListRow = { id: number; slug: string; titleAr: string; titleEn: string; createdAt: string };

export const SegmentedCoursesAdmin: React.FC<Props> = ({ lang }) => {
  const isAr = lang === 'ar';
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [course, setCourse] = useState<SegmentedCourse | null>(null);
  const [segments, setSegments] = useState<CourseSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { listSegmentedCourses().then(setRows).catch(() => {}); }, []);
  useEffect(() => {
    if (view !== 'detail' || !activeSlug) return;
    fetchSegmentedCourse(activeSlug).then(r => { setCourse(r.course); setSegments(r.segments); }).catch(() => {});
  }, [view, activeSlug]);

  const onImport = async (file: File) => {
    const txt = await file.text();
    const m = JSON.parse(txt);
    setCourse(c => c && {
      ...c,
      titleAr: m.course.title_ar ?? c.titleAr,
      titleEn: m.course.title_en ?? c.titleEn,
      passingScorePct: m.course.passing_score_pct ?? c.passingScorePct,
      examQuestionCount: m.course.exam_question_count ?? c.examQuestionCount,
      unlockThresholdPct: m.course.unlock_threshold_pct ?? c.unlockThresholdPct,
    });
    setSegments(m.segments.map((s: any) => ({
      id: 0, num: s.num, slug: s.slug,
      titleAr: s.title_ar, titleEn: s.title_en,
      descriptionAr: s.description_ar, descriptionEn: s.description_en,
      durationSec: s.duration_sec,
      vimeo: { introId: s.vimeo?.intro_id || null, contentId: s.vimeo?.content_id || null, outroId: s.vimeo?.outro_id || null },
      introDurationSec: s.intro_duration_sec ?? null,
      outroDurationSec: s.outro_duration_sec ?? null,
      nextTitleAr: s.next_title_ar, nextTitleEn: s.next_title_en,
      quiz: s.quiz ?? [],
    })));
  };

  const onSave = async () => {
    if (!course) return;
    setBusy(true);
    setStatus(isAr ? 'جاري الحفظ…' : 'Saving…');
    try {
      await upsertSegmentedCourse({
        slug: course.slug,
        titleAr: course.titleAr, titleEn: course.titleEn,
        descriptionAr: course.descriptionAr ?? undefined,
        descriptionEn: course.descriptionEn ?? undefined,
        language: course.language,
        passingScorePct: course.passingScorePct,
        examQuestionCount: course.examQuestionCount,
        unlockThresholdPct: course.unlockThresholdPct,
        segments: segments.map(s => ({
          num: s.num, slug: s.slug,
          titleAr: s.titleAr, titleEn: s.titleEn,
          descriptionAr: s.descriptionAr, descriptionEn: s.descriptionEn,
          durationSec: s.durationSec,
          vimeo: s.vimeo,
          introDurationSec: s.introDurationSec,
          outroDurationSec: s.outroDurationSec,
          nextTitleAr: s.nextTitleAr, nextTitleEn: s.nextTitleEn,
          quiz: s.quiz,
        })),
      });
      setStatus(isAr ? 'تم الحفظ' : 'Saved');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) {
      setStatus((isAr ? 'خطأ: ' : 'Error: ') + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (view === 'list') {
    return (
      <div>
        <span className="text-label">{isAr ? 'الكورسات المُجزّأة' : 'Segmented courses'}</span>
        <h2 className="text-h2 mt-1 mb-4">{isAr ? 'الكورسات المتاحة' : 'Available courses'}</h2>
        <div className="space-y-2">
          {rows.map(r => (
            <button key={r.id}
              className="card card-tight p-4 w-full text-start flex justify-between items-center"
              onClick={() => { setActiveSlug(r.slug); setView('detail'); }}>
              <div>
                <div className="text-h4">{isAr ? r.titleAr : r.titleEn}</div>
                <div className="text-caption" style={{ color: 'var(--text-muted)' }}>/{r.slug}</div>
              </div>
              <span className="text-caption">{isAr ? 'إدارة' : 'Manage'} ›</span>
            </button>
          ))}
          {rows.length === 0 && (
            <p className="text-body-m" style={{ color: 'var(--text-muted)' }}>{isAr ? 'لا توجد كورسات بعد' : 'No segmented courses yet'}</p>
          )}
        </div>
      </div>
    );
  }

  // detail view
  return (
    <div>
      <button onClick={() => setView('list')} className="btn btn-ghost btn-sm mb-3">‹ {isAr ? 'رجوع' : 'Back'}</button>
      {!course ? <Loader2 className="w-5 h-5 animate-spin" /> : (
        <div className="space-y-4">
          <h2 className="text-h2">{isAr ? course.titleAr : course.titleEn}</h2>

          <div className="card card-tight p-4">
            <label className="block mb-3">
              <span className="text-label block mb-1">{isAr ? 'استيراد من manifest.json' : 'Import from manifest.json'}</span>
              <input type="file" accept="application/json"
                     onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
            </label>
          </div>

          <div className="card p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <label><span className="text-label block">{isAr ? 'درجة النجاح %' : 'Passing %'}</span>
                <input className="input" type="number" value={course.passingScorePct}
                       onChange={e => setCourse({ ...course, passingScorePct: Number(e.target.value) || 0 })} />
              </label>
              <label><span className="text-label block">{isAr ? 'عدد أسئلة الاختبار' : 'Exam Qs'}</span>
                <input className="input" type="number" value={course.examQuestionCount}
                       onChange={e => setCourse({ ...course, examQuestionCount: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <table className="w-full text-body-m">
              <thead className="text-label">
                <tr><th>#</th><th>{isAr ? 'العنوان' : 'Title'}</th><th>intro</th><th>content</th><th>outro</th></tr>
              </thead>
              <tbody>
                {segments.map((s, i) => (
                  <tr key={s.num}>
                    <td>{s.num}</td>
                    <td>{isAr ? s.titleAr : s.titleEn}</td>
                    {(['introId','contentId','outroId'] as const).map(k => (
                      <td key={k}>
                        <input className="input" style={{ width: 130 }}
                               value={s.vimeo[k] || ''}
                               onChange={e => {
                                 const copy = [...segments];
                                 copy[i] = { ...s, vimeo: { ...s.vimeo, [k]: e.target.value } };
                                 setSegments(copy);
                               }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button disabled={busy} className="btn btn-primary btn-md mt-4" onClick={onSave}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isAr ? 'حفظ' : 'Save'}
            </button>
            {status && <p className="text-caption mt-2">{status}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Mount it in `AdminPanel.tsx`** as a new tab

`AdminPanel.tsx` uses a tab system: `const [activeTab, setActiveTab] = useState<'dash' | 'logo' | 'badge' | 'cert' | 'email' | 'courses'>('dash');` (line ~49) with a `tabs` array (line ~339) and rendering `{activeTab === 'courses' && <CoursesAdmin lang={lang} />}` (line ~435).

Make these edits:

1. Add import near line 46:

```tsx
import { SegmentedCoursesAdmin } from './SegmentedCoursesAdmin';
```

2. Update the tab union type (line ~49):

```tsx
const [activeTab, setActiveTab] = useState<'dash' | 'logo' | 'badge' | 'cert' | 'email' | 'courses' | 'segmented'>('dash');
```

3. Add a tab entry to the `tabs` array (line ~339). Use any reasonable Lucide icon (e.g. `LayoutGrid` from `lucide-react` — already imported elsewhere in the file or add it to the import).

```tsx
{ key: 'segmented', ar: 'كورسات مُجزّأة', en: 'Segmented courses', Icon: LayoutGrid },
```

4. Add the render branch right after the `'courses'` branch (line ~435):

```tsx
{activeTab === 'segmented' && (
  <SegmentedCoursesAdmin lang={lang} />
)}
```

5. Update the `activeTab !== 'courses'` checks at lines ~419 and ~492 to also exclude `'segmented'`:

```tsx
{activeTab !== 'courses' && activeTab !== 'segmented' && (
```

(The same change at both lines.)

- [ ] **Step 3: Commit**

```bash
git add src/components/SegmentedCoursesAdmin.tsx src/components/AdminPanel.tsx
git commit -m "feat(admin): SegmentedCoursesAdmin with manifest import"
```

---

## Task 25: Integrate `SegmentedCourseViewer` into `App.tsx`

The existing `CourseViewer` keeps working for legacy courses; add a new boolean and route TCP through `SegmentedCourseViewer`.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the import**

Near the top of `App.tsx`:

```tsx
import { SegmentedCourseViewer } from './components/SegmentedCourseViewer';
```

- [ ] **Step 2: Add a state hook + a CTA**

Find where `showCourse` is declared (search for `setShowCourse`). Add nearby:

```tsx
const [showSegmentedCourse, setShowSegmentedCourse] = useState(false);
```

Add a button next to the existing "Knowledge center" CTA — the same wizard step that currently shows "Open course" should now offer a "TCP Course" button too. Find the existing CTA (search for `setShowCourse(true)`) and duplicate it:

```tsx
<button onClick={() => setShowSegmentedCourse(true)} className="btn btn-primary btn-md">
  {isAr ? 'دورة TCP' : 'TCP Course'}
</button>
```

- [ ] **Step 3: Mount the viewer**

Find the existing line (near line 1999):

```tsx
{showCourse && <CourseViewer onClose={() => setShowCourse(false)} lang={lang} />}
```

Add immediately below:

```tsx
{showSegmentedCourse && (
  <SegmentedCourseViewer
    lang={lang}
    courseSlug="tcp"
    onClose={() => setShowSegmentedCourse(false)}
    onStartExam={() => {
      setShowSegmentedCourse(false);
      handleStartExam();
    }}
  />
)}
```

- [ ] **Step 4: Lint check**

```bash
npm run lint
```

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```

Sign in, click the new "TCP Course" CTA. Verify the player opens, shows the curriculum, and "Start final exam" is disabled with the tooltip explaining the unlock requirement. Click close, verify you're back on the wizard. Click "Start final exam" (force-enable by completing >=18 segments in the DB if you want to test the handoff): you should go straight into the existing exam wizard.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate SegmentedCourseViewer with TCP CTA + exam handoff"
```

---

## Task 26: Vimeo upload checklist (manual)

Done outside the code. The plan must produce a clear checklist so the engineer / user can do it correctly.

- [ ] **Step 1: For each segment 01..22**:
  1. Upload `work/intros/intro-XX.mp4`. Privacy → "Hide from Vimeo.com". Embed → only specific domains: `tornix-test.ailigent.ai` and `localhost`. Copy the video ID.
  2. Upload `work/segments/content-XX.mp4`. Same privacy settings. Copy ID.
  3. Upload `work/outros/outro-XX.mp4`. Same privacy settings. Copy ID.

- [ ] **Step 2: Paste IDs into the manifest**

Open `/home/karem/side projects/hyperframe/work/segments/manifest.json` and fill the `vimeo` blocks for each segment.

- [ ] **Step 3: (Optional) Capture exact durations**

```bash
for f in /home/karem/side\ projects/hyperframe/work/intros/intro-*.mp4 \
         /home/karem/side\ projects/hyperframe/work/outros/outro-*.mp4; do
  echo "$f $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
```

Update each segment's `intro_duration_sec` and `outro_duration_sec` to the printed values.

---

## Task 27: Re-run seed after Vimeo IDs are filled

- [ ] **Step 1: Run the seed**

```bash
cd "/home/karem/projects/tornix test/Tornix.Accreditation"
export SUPABASE_URL="https://xhpdyanfxiuuokygujfj.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<paste-from-dashboard>"
npm run seed:tcp
```

- [ ] **Step 2: Verify in Supabase**

```sql
SELECT num, intro_vimeo_id, content_vimeo_id, outro_vimeo_id
FROM public.course_segments
WHERE course_id = 1
ORDER BY num;
```

Expected: 22 rows, none with NULL vimeo IDs.

---

## Task 28: Manual end-to-end smoke

- [ ] **Step 1: `npm run dev`**

- [ ] **Step 2: Walk segment 1**

Sign in → open TCP Course → verify:
- Intro autoplays
- "Skip intro" button visible during intro
- After intro ends, content plays
- After content ends, outro plays and "Up next" overlay appears with countdown
- After outro ends OR countdown hits 0, segment 2's intro starts automatically
- Sidebar dots for segment 1 (intro/content/outro) all turn green

- [ ] **Step 3: Test exam unlock**

In Supabase SQL editor, set 18 segments completed for your user:

```sql
INSERT INTO public.segment_progress (user_id, segment_id, clip_kind, position_sec, completed_at, updated_at)
SELECT auth.uid(), cs.id, k.kind, 0, now(), now()
FROM public.course_segments cs,
     (VALUES ('intro'),('content'),('outro')) AS k(kind)
WHERE cs.course_id = 1 AND cs.num <= 18
ON CONFLICT DO NOTHING;
```

Reload the viewer → "Start final exam" should be enabled → click it → existing exam wizard should load.

- [ ] **Step 4: Test resume**

Play segment 5 for ~30s, refresh the page. Open the TCP course. It should auto-resume to segment 5 content at the saved position.

- [ ] **Step 5: Test RTL on mobile**

Open the same page on a phone (or DevTools mobile emulation < 1100px width). Confirm the sidebar collapses, video fills the screen, skip-intro and up-next overlays render in the correct corners for RTL.

---

## Task 29: Deploy

- [ ] **Step 1: Run all tests one final time**

```bash
cd "/home/karem/projects/tornix test/Tornix.Accreditation"
npm run lint
npm run test:run
```

Expected: both exit 0.

- [ ] **Step 2: Deploy to Netlify**

```bash
netlify deploy --build --prod
```

Verify the live URL (https://tornix-test.ailigent.ai) shows the new TCP course CTA after login. Walk through segment 1 on prod.

- [ ] **Step 3: Final commit (push state)**

If everything passed, push:

```bash
git push origin main
```

---

## Open items (from spec §13)

These are deliberately out of scope for v1. Track separately if the user wants them:

1. Wire the existing exam to read from `course_segments.quiz` (currently uses Gemini-generated questions)
2. Edit segment 1's quiz answer text ("20 questions, 50% passing" → "30 questions, 70% passing")
3. Confirm Vimeo tier supports domain privacy (Pro/Business required)
4. Resources tab content (empty in v1)
