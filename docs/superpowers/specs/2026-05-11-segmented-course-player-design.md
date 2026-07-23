# Segmented Course Player — Design Spec

**Date:** 2026-05-11
**Author:** Karem (with Claude)
**Status:** Approved (pending implementation plan)

## 1. Goal

Ship a Udemy-style course player for the **Tornix Certified Practitioner (TCP)** course inside the existing `Tornix.Accreditation` site. The course consists of **22 segments**, each with a separate **intro / content / outro** Vimeo video that the player chains together. After completing enough of the course, the learner unlocks the existing exam wizard, which already issues the Tornix Access Pass certificate.

## 2. Source material

Located at `/home/karem/side projects/hyperframe/work/`:

- `final/tcp-XX.mp4` — 22 finished segments (intro+content+outro composited; **not used** by the chained-playback path)
- `intros/intro-XX.mp4`, `outros/outro-XX.mp4` — separate intro/outro clips for each segment
- `segments/content-XX.mp4` — content clip per segment
- `segments/manifest.json` — bilingual title/description/quiz/next-title for all 22 segments

The user uploads the **66 individual clips** (22 × intro/content/outro) to **Vimeo Pro/Business**, enables domain-locked embeds for `tornix-test.ailigent.ai`, and pastes the IDs into `manifest.json` under a new `vimeo` object per segment. A seed script then writes them to Postgres.

## 3. Reused existing infrastructure

The `Tornix.Accreditation` site at `https://tornix-test.ailigent.ai` already provides:

- Google OAuth via Supabase (project `xhpdyanfxiuuokygujfj`)
- Exam wizard in `App.tsx` (`handleStartExam`, `saveAssessmentToCloud`, lines ~771, ~728)
- Certificate rendering (`Tornix_Access_Pass`) using `settings.cert_bg_bytes`
- Netlify Functions pattern: client → JWT-bearing fetch → function verifies → service-role DB write
- Email sending via Resend (`send-email.ts`)

**No magic-link auth, no new Supabase project, no new domain, no cert-API integration is needed** — those are all already there or solved.

## 4. Architecture

### 4.1 New files

```
src/components/SegmentedCourseViewer.tsx     # the new Udemy-style player
src/components/SegmentedCoursesAdmin.tsx     # admin UI for segmented courses
netlify/functions/segmented-courses.ts       # GET list, GET by slug, POST create/update
netlify/functions/progress.ts                # GET my progress for a course, POST upsert
netlify/functions/transcript.ts              # GET transcript slice for a segment
db/migrations/001_segmented_courses.sql      # schema migration
scripts/seed-tcp.ts                          # one-shot seeder from manifest.json
```

### 4.2 Modified files

```
src/api.ts          # add: listSegmentedCourses, fetchSegmentedCourse, fetchMyProgress,
                    #      upsertProgress, upsertSegmentedCourse
src/App.tsx         # one-line addition: route "TCP" course to SegmentedCourseViewer
                    # alongside existing CourseViewer
src/components/AdminPanel.tsx  # mount SegmentedCoursesAdmin alongside CoursesAdmin
package.json        # add: "@vimeo/player", "scripts.seed:tcp"
```

### 4.3 Untouched

The existing `CourseViewer.tsx` keeps working for the legacy single-video courses already in the `courses` table. Old data and old admin UI are not migrated.

## 5. Data model

Three new tables, parallel to the existing `courses`. RLS is enabled on all three but no permissive policies are defined — all access goes through Netlify Functions using the service role, matching the pattern used by `assessments.ts` and `courses.ts`.

```sql
-- db/migrations/001_segmented_courses.sql

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
  user_id       bigint not null references public.users(id) on delete cascade,
  segment_id    bigint not null references public.course_segments(id) on delete cascade,
  clip_kind     text   not null check (clip_kind in ('intro','content','outro')),
  position_sec  numeric(8,2) not null default 0,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, segment_id, clip_kind)
);
create index segment_progress_by_user on public.segment_progress(user_id);

alter table public.segmented_courses enable row level security;
alter table public.course_segments   enable row level security;
alter table public.segment_progress  enable row level security;
-- No grants to authenticated/anon. Service role bypasses RLS.
```

Migration commit flow per the `supabase` skill:

1. Iterate via `mcp__supabase__execute_sql` against the existing project
2. Run `mcp__supabase__get_advisors`; fix any warnings
3. `supabase db pull 001_segmented_courses --local --yes`
4. Commit the generated migration file

## 6. Manifest format

The user edits `/home/karem/side projects/hyperframe/work/segments/manifest.json` in place. The new fields are `course.passing_score_pct`, `course.exam_question_count`, `course.unlock_threshold_pct`, and per segment `vimeo: {intro_id, content_id, outro_id}`, `intro_duration_sec`, `outro_duration_sec`. All other existing fields (titles, descriptions, quiz) are kept as-is.

The seed script (`scripts/seed-tcp.ts`) reads this file, upserts the row in `segmented_courses` (by slug), and upserts 22 rows in `course_segments` (by `(course_id, num)`). Idempotent — safe to re-run after fixing typos or adding Vimeo IDs.

## 7. Player component (`SegmentedCourseViewer.tsx`)

### 7.1 Props

```ts
interface Props {
  lang: 'ar' | 'en';
  courseSlug: string;            // 'tcp'
  onClose: () => void;
  onStartExam: () => void;       // wired to App.tsx's handleStartExam
}
```

### 7.2 Layout

Two-column on desktop (≥1100px): center column = video + below-video tabs; right column (in RTL) = curriculum sidebar. On mobile (<1100px), the sidebar collapses into a `<details>` drawer toggled by the segment counter at the top.

### 7.3 Vimeo embedding

Three iframes per current segment, only the active one shown via `display:none`. On segment change, all three are torn down and recreated for the next segment. Avoids the iframe init flash between intro→content→outro.

```ts
const iframe = iframesRef.current[kind];
iframe.src = `https://player.vimeo.com/video/${seg[`${kind}_vimeo_id`]}?autoplay=0&controls=1&dnt=1`;
const p = new Vimeo.Player(iframe);
p.on('ended', () => dispatch({ type: 'CLIP_ENDED', kind }));
p.on('timeupdate', throttle(7000, ({ seconds }) => writeProgress(seg.id, kind, seconds)));
```

### 7.4 Playback state machine (reducer)

```
            SEG_LOAD                 skip-intro click → seekTo(intro.duration) → CLIP_END
                │                       │
                ▼                       ▼
           ┌─────────┐  CLIP_END   ┌─────────┐  CLIP_END   ┌─────────┐
           │  intro  │ ──────────▶ │ content │ ──────────▶ │  outro  │
           └─────────┘             └─────────┘             └────┬────┘
                                                                │ start upNext (5s ring)
                                                                ▼
                                                        countdown=0 (not cancelled)
                                                          OR CLIP_END
                                                                │
                                            if num<22 → SEG_LOAD(num+1)
                                            if num=22 → state="course_complete"
                                                        → "ابدأ الاختبار النهائي"
                                                          calls onStartExam()
```

### 7.5 Skip-intro and up-next overlays

Absolutely-positioned `<button>` and `<div>` over the iframe, conditionally rendered.

- **Skip intro** — button "تخطي المقدمة" top-left during `intro` state. Click → seek to intro end → triggers normal `ended`.
- **Up next** — card "التالي: {next_title_ar}" bottom-left during `outro` state, with a 5-second `conic-gradient` countdown ring. Click cancels the auto-advance.
- **Last segment** — outro overlay becomes "ابدأ الاختبار النهائي" (enabled only if exam-unlock threshold met).

### 7.6 Curriculum sidebar

22 collapsible rows. Each row shows: number, `title_ar`, three small clip dots (filled when completed), expand chevron. Currently-playing segment auto-expanded and highlighted in violet. Clicking a clip dot jumps to that clip and starts playback.

Bottom of sidebar: "ابدأ الاختبار النهائي" CTA, disabled until `completedSegments / 22 ≥ unlock_threshold_pct/100` (default 18 of 22). Tooltip on disabled state: "أكمل ١٨ مقطعًا على الأقل لفتح الاختبار".

### 7.7 Below-video tabs

- **نظرة عامة** — `description_ar` from `course_segments`
- **النص الكامل** — fetched on demand from `/api/transcript/:segmentSlug`, served from `work/transcript/whisper_segments.json` filtered by the segment's source time range. Each sentence clickable → seeks the `content` iframe.
- **الموارد** — empty state ("قريبًا") in v1.

## 8. Progress tracking

### 8.1 Write path

```
Vimeo timeupdate (throttle 7s) ──▶ api.upsertProgress({segmentId, clipKind, positionSec})
                                       │
                                       ▼  POST /api/progress with Bearer JWT
                                netlify/functions/progress.ts
                                       │  verify JWT → resolve users.id → service-role upsert
                                       ▼
                       INSERT INTO segment_progress (user_id, segment_id, clip_kind,
                                                     position_sec, completed_at, updated_at)
                       VALUES (...) ON CONFLICT (user_id, segment_id, clip_kind)
                       DO UPDATE SET position_sec = EXCLUDED.position_sec,
                                     completed_at = COALESCE(segment_progress.completed_at,
                                                             EXCLUDED.completed_at),
                                     updated_at = now();
```

### 8.2 Completion rule

Computed on the client before write (saves a roundtrip):

```ts
const isComplete = positionSec >= 0.95 * clipDurationSec;
// if isComplete and not previously completed → include completed_at: nowIso()
```

### 8.3 Read path

`fetchMyProgress(courseSlug)` returns `[{segmentId, clipKind, positionSec, completedAt}]` on viewer mount. Reduced into the `progress` map in state. Used for sidebar checkmarks, "continue watching" auto-resume to most recently `updated_at` non-completed clip, and the exam-unlock gate.

### 8.4 Robustness

- Additional writes on `pause`, `ended`, and `beforeunload` (via `navigator.sendBeacon`) so transient network drops don't lose state.
- Throttle of 7s = max ~9 writes/min per active learner.

## 9. Exam handoff

```ts
// App.tsx
{showSegmentedCourse && (
  <SegmentedCourseViewer
    lang={lang}
    courseSlug="tcp"
    onClose={() => setShowSegmentedCourse(false)}
    onStartExam={() => {
      setShowSegmentedCourse(false);
      handleStartExam();  // existing function
    }}
  />
)}
```

The existing `handleStartExam()` runs the full Brief → Exam → Result → Cert flow. No changes to the exam, the cert, or the email.

### 9.1 Open question (flagged, not blocking v1)

The existing exam appears to use a Gemini-generated question set (per `geminiService.ts`), **not** the 44 quiz items we now store in `course_segments.quiz`. If the TCP exam should pull from the segment quizzes instead, that's a separate brainstorm. For v1 the handoff just opens the existing exam as-is.

## 10. Admin UX (`SegmentedCoursesAdmin.tsx`)

Mounted alongside the existing `CoursesAdmin` inside `AdminPanel.tsx`. Two views:

- **List view** — existing segmented courses with row count and "Manage" button.
- **Detail view** — course form with `title_ar`, `title_en`, `passing_score_pct`, `exam_question_count`, plus a 22-row segments table with three Vimeo ID inputs per row. A "📥 استيراد من manifest.json" button parses a pasted/uploaded JSON and fills the entire form.

For the initial TCP load, the seed script handles it; the admin UI exists for future segmented courses and for fix-ups.

## 11. Error handling

| Failure | UX | Recovery |
|---|---|---|
| Vimeo iframe fails to load | "تعذّر تحميل الفيديو" card over the player + retry | Re-init `Vimeo.Player` |
| Progress write fails (network) | Silent. Queue + exponential backoff (1s, 2s, 4s, 8s) | `beforeunload` flushes via `navigator.sendBeacon` |
| Initial course/segment fetch fails | Full-screen "تعذّر تحميل الكورس" + retry | Re-call `listSegmentedCourses` |
| User logged out mid-session | Detect 401 → redirect to login, persist last position in `sessionStorage` | After login, resume at stored position |
| Vimeo IDs missing for a segment | Sidebar row shows "غير متاح بعد" badge, non-clickable | Admin completes upload + re-saves |
| Exam unlock check uncertain | **Fail closed** — keep button disabled | Page reload re-fetches progress |
| Browser blocks `<iframe allow="autoplay">` | Autoplay disabled; "اضغط للمتابعة" overlay between clips | User clicks to advance |

## 12. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | Playback reducer transitions, skip-intro, cancelled up-next, end-of-course unlock |
| Unit | Vitest | Completion rule (`pos ≥ 0.95 × duration`), unlock-threshold computation |
| Integration | Playwright (via `webapp-testing` toolkit) | Mount viewer with stubbed Vimeo player → fire fake `ended` events → assert chain advances + sidebar updates + exam unlocks at 18/22 |
| RLS | `mcp__supabase__execute_sql` | Verify a non-owner JWT cannot read another user's `segment_progress` (defense in depth) |
| Manual smoke | Real browser at `localhost:8888` (`npm run dev`) | One real Vimeo upload, verify autoplay flow, RTL layout, transcript click-seek, mobile drawer |

## 13. Open questions / out of scope

1. **Exam ↔ segment-quiz wiring** (§9.1) — flagged but not blocked. Decide in a follow-up whether the existing exam should pull from `course_segments.quiz`.
2. **Segment-1 quiz answer says "20 questions, 50% passing"** but we settled on 30/70%. The quiz answer text in segment 1 should be edited to match before the segment quizzes are surfaced anywhere.
3. **Vimeo Plus vs Pro/Business** — Pro/Business removes Vimeo branding and adds domain-privacy. The user is on a tier that supports embedded playback; confirm Pro/Business is the chosen tier before publishing.
4. **Resources tab content** — empty in v1 ("قريبًا"). Future addition.
5. **Bilingual exam** — the existing exam's language behavior is inherited; no changes here.

## 14. Build sequence (for the writing-plans phase)

1. Schema migration + seed script — get TCP data in Postgres
2. Netlify Functions: `segmented-courses.ts`, `progress.ts`, `transcript.ts`
3. `api.ts` extensions
4. `SegmentedCourseViewer` skeleton: layout + sidebar + Vimeo embed for one segment
5. Reducer + chained playback (intro → content → outro)
6. Skip-intro + up-next overlays
7. Auto-advance to next segment, end-of-course state
8. Progress write/read + sidebar checkmarks + resume
9. Exam unlock + handoff to `handleStartExam`
10. `SegmentedCoursesAdmin`
11. Error states + retry/backoff + sendBeacon flush
12. Tests (unit + Playwright)
13. Vimeo upload (66 clips), domain-lock, fill IDs into manifest, run seed
14. Manual smoke + deploy via `netlify deploy --prod`
