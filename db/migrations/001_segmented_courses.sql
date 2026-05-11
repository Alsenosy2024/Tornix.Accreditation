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
create index segment_progress_by_segment on public.segment_progress(segment_id);

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
-- Split into explicit operations to avoid multiple permissive policies on SELECT.
-- Use (select auth.uid()) to avoid per-row re-evaluation.
create policy "admin insert courses" on public.segmented_courses
  for insert to authenticated
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin));
create policy "admin update courses" on public.segmented_courses
  for update to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin));
create policy "admin delete courses" on public.segmented_courses
  for delete to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin));

create policy "admin insert segments" on public.course_segments
  for insert to authenticated
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin));
create policy "admin update segments" on public.course_segments
  for update to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin));
create policy "admin delete segments" on public.course_segments
  for delete to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin));

-- Progress: own rows only
create policy "own progress select" on public.segment_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own progress insert" on public.segment_progress
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own progress update" on public.segment_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
