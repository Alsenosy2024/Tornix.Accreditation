-- 002 — Server-side certificate generation
-- Adds cert tracking columns to assessments + RLS + creates the certificates Storage bucket.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS cert_storage_path  TEXT,
  ADD COLUMN IF NOT EXISTS cert_pdf_url       TEXT,
  ADD COLUMN IF NOT EXISTS cert_png_url       TEXT,
  ADD COLUMN IF NOT EXISTS cert_generated_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS assessments_cert_pending_idx
  ON public.assessments (cert_pdf_url) WHERE cert_pdf_url IS NULL;

-- Enable RLS (was not previously enabled).
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- Match by lower(email) — auth.users.id is UUID while public.users.id is BIGSERIAL,
-- and assessments.user_id is BIGINT, so email is the only field that aligns cleanly.
DROP POLICY IF EXISTS "own assessments select" ON public.assessments;
CREATE POLICY "own assessments select" ON public.assessments
  FOR SELECT TO authenticated
  USING (lower(user_email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "own assessments insert" ON public.assessments;
CREATE POLICY "own assessments insert" ON public.assessments
  FOR INSERT TO authenticated
  WITH CHECK (lower(user_email) = lower(auth.jwt() ->> 'email'));

-- Service role bypasses RLS for the background function's UPDATE.

-- Certificates bucket — private, signed URLs only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certificates', 'certificates', false, 20971520, ARRAY['application/pdf','image/png'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can SELECT objects only under their own email prefix.
DROP POLICY IF EXISTS "own cert read" ON storage.objects;
CREATE POLICY "own cert read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'certificates'
         AND name LIKE lower(auth.jwt() ->> 'email') || '/%');
-- No INSERT/UPDATE/DELETE policy → only service role writes.
