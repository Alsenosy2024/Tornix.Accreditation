# Migrate Tornix.Accreditation off managed services onto a single EC2

**Status:** design approved, ready for implementation plan
**Date:** 2026-05-18
**Migration target branch:** `worktree-feat+segmented-course-player` (will be merged to `main` before cutover)

## Goal

Move the entire Tornix.Accreditation stack — frontend, API, database, auth, object storage, cert renderer — off Netlify + Supabase and onto a single EC2 instance in Frankfurt. Operate it the same way as Mahara and SPCO: bare-metal Linux services managed by systemd, no Docker, no managed cloud dependencies. Public URL stays `https://tornix-test.ailigent.ai`.

## Non-goals

- Multi-AZ / HA. Single instance is acceptable for the current user volume.
- Auto-scaling. Vertical scale only.
- Containerization (Docker / k8s). Bare systemd matches the operator's existing patterns.
- Replacing external SaaS that's not on the AWS-managed list: Gemini, Resend, Vimeo, and Google OAuth stay external.
- Refactoring application logic beyond what the migration requires. The certificate template, assessment scoring, segmented player chaining are not touched.

## Constraints

- 156 historical passing assessments with rendered PDFs + PNGs must remain downloadable post-migration.
- Existing Google OAuth client (`GOOGLE_CLIENT_ID` / `_SECRET`) is reused — no user-visible re-consent required.
- All `/api/*` URLs the client already calls must continue to work unchanged.
- Single 30-60 min maintenance window is acceptable for cutover; no zero-downtime requirement.
- Operator preference: manual `git pull` + `npm run build` + `systemctl restart` deploys (no CI/CD).

## Architecture

One **t3.medium EC2** in `eu-central-1` running five systemd-managed services:

```
                                              EC2 (Frankfurt, t3.medium, Ubuntu 24.04)
                                        ┌──────────────────────────────────────────┐
   Browser ──► Caddy :443 ──► Node API :3000 ─┬─► Postgres 16  (unix socket only)  │
   (HTTPS, LE)        │                       ├─► MinIO :9000  (127.0.0.1)         │
                      │                       └─► (enqueues cert_jobs row)         │
                      └─► /  static dist/                                          │
                                                                                   │
                          Cert worker (systemd) ──► Postgres (poll cert_jobs)      │
                              └─► Chromium (apt) ──► MinIO (put cert files)        │
                                        └──────────────────────────────────────────┘
```

| Process | Unit | Bind |
|---|---|---|
| Reverse proxy + TLS + static | `caddy.service` (apt) | 0.0.0.0:80, :443 |
| Express API | `tornix-api.service` | 127.0.0.1:3000 |
| Cert worker | `tornix-cert-worker.service` | (no listener; polls DB) |
| Postgres 16 | `postgresql.service` (apt) | unix socket only |
| MinIO | `minio.service` | 127.0.0.1:9000, console :9001 |

Security group: 22 (SSH, operator IP only), 80, 443. Nothing else.

## What goes away

- Supabase project `xhpdyanfxiuuokygujfj` (auth, Postgres, Storage, RLS). Project archived post-cutover.
- Netlify site `3ce2cf3c-3068-4154-a140-7187aa7ffacb`. Functions + CDN + redirects.
- `@sparticuz/chromium-min`, `CHROMIUM_PACK_URL`, the pinned-v137 dance — replaced by `apt install chromium-browser`.
- `CERT_RENDERER_SECRET` — the worker pulls from a job table, no fire-and-forget HTTP between API and worker.
- `@supabase/supabase-js`, `@netlify/functions`, `firebase-admin`, `html2canvas`, `jspdf`, `ws` dependencies.
- Stored Supabase signed URLs in `cert_pdf_url` / `cert_png_url` — the API now regenerates presigned URLs on each fetch.

## Filesystem layout

```
/opt/tornix/                          # git clone, owned by tornix user
  ├── server/                         # NEW: Express API
  ├── worker/                         # NEW: cert worker
  ├── shared/                         # NEW: branding.ts, cert-template.ts (ported)
  ├── src/                            # existing Vite frontend (small diffs)
  ├── dist/                           # vite build output, served by Caddy
  ├── server-dist/                    # tsc build output for server + worker
  ├── db/schema.sql, db/migrations/   # schema + 003_cert_jobs.sql added
  ├── scripts/                        # deploy.sh, migrate-certs.ts, backfill-certs.ts
  └── .env                            # mode 600

/var/lib/postgresql/16/main/          # apt default — Postgres data dir
/var/lib/minio/                       # MinIO data root (the `certificates` bucket lives here)
/var/lib/tornix/chromium-cache/       # Puppeteer user-data-dir (avoid /tmp)
/etc/caddy/Caddyfile                  # TLS + reverse proxy
/etc/systemd/system/tornix-api.service
/etc/systemd/system/tornix-cert-worker.service
/etc/systemd/system/minio.service
```

Linux user `tornix` owns `/opt/tornix`, `/var/lib/tornix`, `/var/lib/minio`. Postgres uses its apt-default `postgres` user with peer auth.

## Code restructure: Netlify Functions → Express

All 10 functions in `netlify/functions/*.ts` (~924 LOC) become Express routes under `server/routes/`. Every existing `/api/*` URL stays the same.

| Existing handler | New route file | Notes |
|---|---|---|
| `me.ts` | `routes/me.ts` | `requireAuth`; replace Supabase JWT verify with `jose.jwtVerify` |
| `courses.ts` | `routes/courses.ts` | `sb.from('courses')` → `pg.query` |
| `assessments.ts` | `routes/assessments.ts` | POST also enqueues a `cert_jobs` row; no more fire-and-forget fetch |
| `assessment-cert.ts` | `routes/assessment-cert.ts` | Returns freshly-presigned MinIO URLs, not stored URLs |
| `settings-branding.ts` | `routes/settings-branding.ts` | Public read + admin write; bytea blobs unchanged |
| `segmented-courses.ts` | `routes/segmented-courses.ts` | `sb` → `pg` |
| `progress.ts` | `routes/progress.ts` | `sb` → `pg` |
| `transcript.ts` | `routes/transcript.ts` | `sb` → `pg` |
| `send-email.ts` | `routes/send-email.ts` | Resend SDK unchanged |
| `assessment-cert-generate-background.ts` | `worker/index.ts` + `worker/render.ts` | No longer a function — separate Node process polling `cert_jobs` |
| **NEW** | `routes/auth.ts` | `GET /api/auth/google` + `GET /api/auth/google/callback` |
| **NEW** | `routes/health.ts` | `GET /api/health` — used by deploy script |

The `certificate-renderer/branding.ts` + `template.ts` files port over to `shared/` with `sb.from('settings')` replaced by `pg.query`. `template.ts` is otherwise unchanged — the FONT_MAP single-quotes gotcha, explicit `2480px × 3508px` PDF dimensions, and the name-font ladder all stay locked in.

### Frontend changes (`src/`)

Minimal:
- **`src/api.ts`** — `Authorization` header reads `localStorage.getItem('tornix.jwt')` instead of `supabase.auth.getSession()`.
- **`src/useSession.ts`** — rewritten as ~30 lines. Reads JWT from localStorage, decodes (no client-side verify), parses `#token=…` URL fragment on first load after OAuth callback.
- **`src/supabase.ts`** — deleted.
- **`src/App.tsx`** — no logic change; the OAuth-callback handoff is in `useSession`.

No other component touches Supabase, so the rest of `src/` is untouched.

### Dependencies

**Remove**: `@supabase/supabase-js`, `@sparticuz/chromium-min`, `@netlify/functions`, `firebase-admin`, `html2canvas`, `jspdf`, `ws`.

**Add**: `express`, `pg` (already there), `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `puppeteer-core`, `google-auth-library`, `jose`.

## Authentication & authorization

### Flow

```
Client → GET /api/auth/google?next=/
Server: state = randomUUID(); INSERT oauth_state(state, payload={next}); 302 → Google authorize URL with state

Google → user picks account → 302 → /api/auth/google/callback?code=…&state=…

Server callback:
  1. DELETE FROM oauth_state WHERE state=$1 AND created_at > now()-interval '10 min' RETURNING payload
     (fails if missing/expired → 400)
  2. Exchange code for tokens via google-auth-library
  3. Verify id_token (RS256, Google JWKS), extract sub, email, name, picture
  4. INSERT INTO users … ON CONFLICT (email) DO UPDATE — sets google_sub, name, photo_url, last_login_at
  5. Sign our own JWT (HS256, JWT_SECRET, 7d): { sub: users.id, email, name, picture, is_admin }
  6. 302 → {next}#token=<jwt>

Client mounts → location.hash starts with '#token=' → localStorage.setItem('tornix.jwt', t)
              → history.replaceState(null, '', clean URL) → setUser(decodeJwt(t))
```

JWT goes in the URL **fragment**, not query, so it never reaches Caddy access logs.

### Middleware

```
requireAuth: reads `Authorization: Bearer <jwt>`, jose.jwtVerify, sets req.user, else 401.
requireAdmin: chains after requireAuth, checks req.user.isAdmin, else 403.
```

### Authz patterns (replace RLS)

| Pattern | Where | Implementation |
|---|---|---|
| Public, no auth | `GET /api/settings/branding`, public courses preview | no middleware |
| Auth only | `GET /api/me`, `GET /api/courses` | `requireAuth` |
| Own-data | `GET/POST /api/assessments`, `/api/progress`, `/api/transcript`, `/api/assessments/:id/cert` | `requireAuth` + `WHERE lower(user_email) = lower($1)` with `$1 = req.user.email`, admin override |
| Admin only | `PATCH /api/settings/branding`, admin assessment listings, `POST /api/send-email` | `requireAuth, requireAdmin` |

### Admin bootstrap

`ADMIN_EMAILS` Set in code is gone. On first deploy:

```sql
UPDATE users SET is_admin = true
WHERE lower(email) IN ('ahmed0ibrahim@gmail.com', 'ahmedzeroibrahim@gmail.com', 'karm92000@gmail.com');
```

JWT carries `is_admin`. Adding a new admin = SQL flip + the user re-signs-in.

### Token storage decision

localStorage (not httpOnly cookie). Justification: simpler SPA handoff via `#token=…`, no CSRF concerns, no SameSite headaches. The threat model is an internal accreditation tool with hundreds of users, no user-supplied HTML rendering, no third-party scripts. XSS risk is acceptable.

## Object storage (MinIO)

Single-node MinIO at `127.0.0.1:9000`, data at `/var/lib/minio/`. One private bucket `certificates`.

**Path layout unchanged**: `certificates/{lower(email)}/{assessmentId}.{pdf,png}` — keeps existing `cert_storage_path` values valid post-migration.

**`server/storage.ts`** uses `@aws-sdk/client-s3` with `forcePathStyle: true`:

```ts
export async function putCertificate(path: string, buf: Buffer, mime: string) { … }
export async function presignedGet(path: string, ttlSeconds = 60 * 60 * 24 * 365) { … }
```

**Signed-URL handling on cutover**: Supabase signed URLs in `cert_pdf_url` / `cert_png_url` are HMAC'd by Supabase's secret and won't work against MinIO. The API regenerates a presigned URL on every `GET /api/assessments/:id/cert` from `cert_storage_path`. The stored URL columns become deprecated; we keep them populated for compatibility but the API no longer reads them.

**Backups (post-cutover, out of scope for the migration itself)**: nightly `mc mirror /var/lib/minio/certificates s3://<offsite>`.

## Cert pipeline on EC2

System Chromium via `apt install chromium-browser fonts-liberation libxss1 libgconf-2-4`. `puppeteer-core` launches `/usr/bin/chromium-browser`. No `@sparticuz/chromium-min`, no pinned pack URL.

### `cert_jobs` table (durability)

```sql
-- db/migrations/003_cert_jobs.sql
CREATE TABLE cert_jobs (
  id            BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed')),
  attempts      INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cert_jobs_pending_idx ON cert_jobs (status, created_at)
  WHERE status IN ('pending','running');
```

### Worker loop

```ts
async function pollOnce(): Promise<boolean> {
  const job = await pgTx(async (tx) => {
    const { rows } = await tx.query(`
      SELECT id, assessment_id FROM cert_jobs
      WHERE status='pending' AND attempts < 3
      ORDER BY created_at ASC LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    if (!rows.length) return null;
    await tx.query(`UPDATE cert_jobs SET status='running', attempts=attempts+1, updated_at=now() WHERE id=$1`, [rows[0].id]);
    return rows[0];
  });
  if (!job) return false;

  try {
    await renderAndUpload(job.assessment_id);   // puts PDF+PNG to MinIO + UPDATE assessments SET cert_storage_path=…, cert_generated_at=now(), cert_pdf_url=NULL, cert_png_url=NULL
    await q(`UPDATE cert_jobs SET status='done', updated_at=now() WHERE id=$1`, [job.id]);
  } catch (e) {
    const err = String(e?.message || e);
    const final = (await q(`SELECT attempts FROM cert_jobs WHERE id=$1`, [job.id])).rows[0].attempts >= 3;
    await q(`UPDATE cert_jobs SET status=$2, last_error=$3, updated_at=now() WHERE id=$1`,
            [job.id, final ? 'failed' : 'pending', err]);
  }
  return true;
}

while (true) {
  const did = await pollOnce();
  await sleep(did ? 0 : 3000);
}
```

**Concurrency**: one render at a time. Chromium peak ~600-800 MB; concurrent renders risk OOM on t3.medium.

**Backfill**: `npm run backfill:certs` (script in `scripts/backfill-certs.ts`) inserts `cert_jobs` rows for any `assessments` where `score >= 60 AND cert_storage_path IS NULL`. Same operator UX as today.

## Data migration

Order:

1. **Provision EC2.** Ubuntu 24.04, `apt install postgresql-16 chromium-browser caddy nodejs`, install MinIO binary, create `tornix` user, clone repo to `/opt/tornix`, install deps, build.
2. **Create database**: `createdb tornix_accreditation`, run `db/schema.sql`, then `db/migrations/001_segmented_courses.sql`, `002_cert_columns.sql`, `003_cert_jobs.sql` in order.
3. **Dump Supabase**:
   ```bash
   pg_dump "$SUPABASE_PG_URL" --no-owner --no-privileges \
     --table=public.users --table=public.settings \
     --table=public.courses --table=public.assessments \
     --table=public.segmented_courses --table=public.course_segments \
     --data-only > tornix-data.sql
   ```
4. **Restore on EC2**: `psql tornix_accreditation < tornix-data.sql`. Reset sequences for `users`, `courses`, `assessments`, `segmented_courses`, `course_segments`.
5. **Migrate cert bucket**: `scripts/migrate-certs.ts` lists each folder in Supabase Storage `certificates` bucket, downloads each PDF/PNG with the service-role key, uploads to MinIO at the same key. ~312 objects, sequential is fine.
6. **Verify**:
   - Row counts match on both sides.
   - Spot-check 3 random `assessments` from each: `score`, `user_email`, `cert_storage_path` identical.
   - MinIO object count matches Supabase bucket count.
   - Curl a presigned URL from MinIO, confirm PDF opens.
7. **Bootstrap admins**: the UPDATE above.

## Cutover

Pre-lower DNS TTL on `tornix-test.ailigent.ai` to 60s the day before.

```
T+0:00  Netlify → maintenance mode (redirect rule to a static "be right back" page)
T+0:02  Final pg_dump from Supabase
T+0:10  Restore on EC2 + reset sequences
T+0:15  Run migrate-certs.ts
T+0:25  Verification queries; if mismatch → abort, rollback DNS-side
T+0:30  Google OAuth client: confirm `https://tornix-test.ailigent.ai/api/auth/google/callback` is the registered redirect URI; remove the temp `tornix-ec2.ailigent.ai` callback added during pre-cutover smoke testing
T+0:32  DNS: tornix-test.ailigent.ai A record from Netlify → EC2 elastic IP
T+0:35  Caddy auto-issues LE cert (~30s)
T+0:40  Smoke test (see below)
T+0:50  Take down maintenance page → done
```

**Rollback**: flip DNS back to Netlify. Supabase + Netlify remain untouched until the new stack is verified for ~24h, then archived.

## Deployment workflow

Initial:

```bash
ssh ec2-user@<ip>
sudo -u tornix bash -c '
  git clone https://github.com/Alsenosy2024/Tornix.Accreditation.git /opt/tornix
  cd /opt/tornix
  npm ci
  npm run build         # vite → dist/
  npm run build:server  # tsc → server-dist/
'
sudo systemctl enable --now tornix-api tornix-cert-worker
sudo systemctl reload caddy
```

Subsequent deploys (`scripts/deploy.sh`):

```bash
#!/bin/bash
set -euo pipefail
cd /opt/tornix
git pull --ff-only
npm ci
npm run build
npm run build:server
sudo systemctl restart tornix-api tornix-cert-worker
curl -fsS http://127.0.0.1:3000/api/health
```

Run via SSH. No CI. Matches Mahara/SPCO pattern.

Logs go to journald: `journalctl -u tornix-api -f`.

## Environment variables

```
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://tornix-test.ailigent.ai

# Database
DATABASE_URL=postgres:///tornix_accreditation        # peer auth via unix socket

# Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=<32 random bytes encoded as 64 hex chars — `openssl rand -hex 32`>

# Object storage
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=certificates
S3_FORCE_PATH_STYLE=true

# External services (unchanged)
GEMINI_API_KEY=...
RESEND_API_KEY=...
VIMEO_ACCESS_TOKEN=...

# Cert pipeline
CHROMIUM_PATH=/usr/bin/chromium-browser
```

Removed: all `VITE_SUPABASE_*`, `SUPABASE_*`, `CERT_RENDERER_SECRET`, `CHROMIUM_PACK_URL`, `NETLIFY_DATABASE_URL`.

## Testing & verification

**Pre-cutover smoke test (EC2 via temp subdomain `tornix-ec2.ailigent.ai`):**

1. Visit `/`, click Sign in with Google, complete OAuth, land back signed in.
2. `GET /api/me` returns correct profile.
3. Admin sees admin panel; non-admin doesn't.
4. Take an assessment end-to-end, score ≥ 60.
5. Cert worker picks up job within 5s, render completes <30s, PDF + PNG in MinIO.
6. Client polling `GET /api/assessments/:id/cert` returns a working presigned URL.
7. Downloaded PDF matches current production layout.
8. Segmented course player loads, plays intro→content→outro, marks progress.
9. Branding admin updates `nameY`, change reflected in next cert.
10. Reload page — session persists from localStorage; expired session redirects cleanly.

**Post-cutover verification (production DNS):**

1. All 10 above pass.
2. User with historical certs can download them (presigned URL regen works).
3. No console errors, no failed network requests in DevTools.
4. `journalctl -u tornix-api --since "5 min ago"` clean.
5. `journalctl -u tornix-cert-worker --since "5 min ago"` shows job-pickup heartbeats.

## Out of scope (deliberately)

- Monitoring/alerting beyond journald + manual checks. Add later if needed.
- Off-box backups. Set up post-migration with `mc mirror` to S3.
- Rate limiting. App has admin-gated mutating endpoints + Google OAuth — abuse surface is small.
- WAF / fail2ban. Caddy + small attack surface is sufficient for v1.
- Blue-green deploys. Single-instance restart is acceptable.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Chromium OOM on t3.medium under concurrent renders | Low (worker is single-concurrency) | Worker enforces 1-at-a-time; can vertical-scale if assessment volume grows. |
| `oauth_state` table grows unbounded | Low | Each callback deletes its row; add a nightly cleanup cron for stale rows >10min if it accumulates. |
| pg_dump misses RLS-protected rows we don't have service-role access to | Low | We have the Supabase service-role key from the existing cert pipeline; `pg_dump` over the direct Postgres connection bypasses RLS entirely. |
| Cert migration script chokes on a file | Medium | Sequential, idempotent (PutObject is `upsert: true`). Re-run on failure. |
| LE cert issuance fails because of rate limit | Low | We're on a fresh subdomain pair (`tornix-test`, `tornix-ec2`), well under LE limits. |
| Branding bytea blobs corrupt during `pg_dump`/`psql` | Low | `pg_dump` handles bytea natively. Verify by loading the admin panel post-cutover and confirming logo renders. |
| User-facing JWT expires while a long session is open | Medium | 7d expiry; on 401, client redirects to sign-in. Google session usually pre-authorized, so re-auth is one click. |

## Implementation order

Tracked separately in the implementation plan (writing-plans next). Rough sequence:

1. Provision EC2 + base packages (Postgres, Chromium, Node, Caddy, MinIO)
2. Build `server/` (Express skeleton + auth + middleware + health)
3. Build `worker/` (job table, polling loop, ported renderer)
4. Port functions to routes one-by-one (smallest first: `me` → `courses` → `settings-branding` → …)
5. Port frontend (`api.ts`, `useSession.ts`, delete `supabase.ts`)
6. Write migration scripts (`migrate-certs.ts`, sequence resets)
7. End-to-end smoke against temp subdomain
8. Cutover window
