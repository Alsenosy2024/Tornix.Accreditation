-- EC2-compatible segment_progress table.
-- Migration 001 defines this with user_id uuid (Supabase-only) and
-- RLS policies using the "authenticated" role which does not exist on EC2.
-- This migration creates the table with user_id bigint (matching users.id)
-- and no RLS dependencies.

CREATE TABLE IF NOT EXISTS public.segment_progress (
  user_id       bigint not null references public.users(id) on delete cascade,
  segment_id    bigint not null references public.course_segments(id) on delete cascade,
  clip_kind     text   not null check (clip_kind in ('intro','content','outro')),
  position_sec  numeric(8,2) not null default 0,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, segment_id, clip_kind)
);
CREATE INDEX IF NOT EXISTS segment_progress_by_user    ON public.segment_progress(user_id);
CREATE INDEX IF NOT EXISTS segment_progress_by_segment ON public.segment_progress(segment_id);
