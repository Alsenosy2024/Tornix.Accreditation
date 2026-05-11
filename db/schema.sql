-- Tornix Accreditation: Postgres schema (replaces Firestore)
-- Idempotent: safe to run multiple times.

-- ---------------------------------------------------------------
-- users: replaces Firebase Auth
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    BIGSERIAL PRIMARY KEY,
  email                 TEXT UNIQUE NOT NULL,
  name                  TEXT,
  photo_url             TEXT,
  google_sub            TEXT UNIQUE,                -- Google's stable user id (sub claim)
  legacy_firebase_uid   TEXT UNIQUE,                -- preserved for old-data linkage
  is_admin              BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

-- ---------------------------------------------------------------
-- settings: replaces settings/branding doc (+ chunked branding_* docs)
-- single row keyed by 'branding'. Image blobs live in bytea columns.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_bytes    BYTEA,
  logo_mime     TEXT,
  badge_bytes   BYTEA,
  badge_mime    TEXT,
  cert_bg_bytes BYTEA,
  cert_bg_mime  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- courses: replaces courses collection
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id              BIGSERIAL PRIMARY KEY,
  legacy_id       TEXT UNIQUE,                       -- old Firestore doc id, for traceability
  title           TEXT NOT NULL,
  video_url       TEXT,
  chapters        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courses_created_at_idx ON courses (created_at DESC);

-- ---------------------------------------------------------------
-- assessments: replaces users/{uid}/assessments/{id} subcollection
-- user_id may be NULL for legacy/orphan rows; email is denormalized
-- so admin dashboard still works for users that never signed in again.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessments (
  id                BIGSERIAL PRIMARY KEY,
  legacy_id         TEXT UNIQUE,                     -- old Firestore assessment id
  user_id           BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_email        TEXT NOT NULL,
  user_name         TEXT,
  user_photo        TEXT,
  score             NUMERIC NOT NULL,
  integrity_score   NUMERIC NOT NULL DEFAULT 0,
  serial_number     TEXT,
  status            TEXT NOT NULL CHECK (status IN ('Started', 'completed', 'terminated', 'Passed', 'Failed')),
  answers           JSONB NOT NULL DEFAULT '[]'::jsonb,
  questions_count   INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessments_user_id_idx     ON assessments (user_id);
CREATE INDEX IF NOT EXISTS assessments_user_email_idx  ON assessments (lower(user_email));
CREATE INDEX IF NOT EXISTS assessments_created_at_idx  ON assessments (created_at DESC);

-- ---------------------------------------------------------------
-- oauth_state: short-lived CSRF tokens for Google OAuth flow
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_state (
  state       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cleanup helper: callers should opportunistically delete rows older than 10 min.
CREATE INDEX IF NOT EXISTS oauth_state_created_at_idx ON oauth_state (created_at);
