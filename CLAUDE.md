# Tornix.Accreditation — CLAUDE.md

Standalone React + Express accreditation site that issues "Tornix Access Pass" certificates after an assessment. Separate from the main Tornix PMO app.

- **Live**: https://tornix-test.ailigent.ai
- **Hosting**: AWS EC2 `i-083f45a8aac07ce5e` (`t3.medium`, Ubuntu 24.04) in `eu-central-1`; Route 53 `tornix-test.ailigent.ai` points to `3.79.150.56`
- **Live checkout**: `/opt/tornix` on branch `feat+ec2-migration`, owned by the `tornix` service user
- **Web/API**: Caddy serves `/opt/tornix/dist` and proxies `/api/*` to Express on `127.0.0.1:3000`
- **Services**: `tornix-api.service` and `tornix-cert-worker.service`; Postgres 16 and MinIO run on the same EC2 instance
- **GitHub**: `Alsenosy2024/Tornix.Accreditation`
- **Deployment**: manual, directly on the EC2 server; there is no CI/CD or Netlify deployment

## Stack

- Vite + React 19 + TypeScript, Tailwind v4, lucide-react, Motion, Recharts
- Express 5 API in `server/`; Caddy reverse-proxies `/api/*` to `127.0.0.1:3000`
- Google OAuth + JWT sessions; Postgres 16 is the source of truth
- S3-compatible certificate storage via local MinIO (`127.0.0.1:9000`)
- Gemini (`@google/genai`) AI; Resend email; `@vimeo/player` for chained segment playback
- Certificates are rendered by the `tornix-cert-worker` Node service with Puppeteer and system Chromium

## Schema (`db/schema.sql` + `db/migrations/*.sql`)

- `users` — Google OAuth identity, admin flag, and legacy Firebase linkage
- `settings` — single `branding` row; bytea blobs `logo_bytes`/`badge_bytes`/`cert_bg_bytes`; layout/colors in `data` JSONB
- `courses` — title, video URL, chapters JSONB
- `assessments` — score, status, answers, owner fields, and certificate metadata
- `segmented_courses` / `course_segments` / `segment_progress` — segmented Vimeo course and learner progress
- `oauth_state` — short-lived OAuth CSRF state
- `cert_jobs` — DB-backed certificate render queue consumed by `tornix-cert-worker`

Certificate object path: `certificates/{user_email}/{assessment_id}.{pdf,png}` in MinIO. Downloads stream through the authenticated API.

## Commands

```bash
npm run dev                # Vite + Express API + certificate worker
npm run lint               # client and server TypeScript checks
npm run test:run           # client/unit tests
npm run test:server        # API/worker tests
npm run build:all          # build frontend dist + server-dist
npm run backfill:certs     # enqueue missing historical certificates
```

## Manual production deployment (AWS EC2)

There is no automated deployment pipeline. Deploy directly to the live checkout after pushing and verifying `feat+ec2-migration`:

```bash
# Connect as ubuntu using EC2 Instance Connect or the authorized SSH key.
ssh ubuntu@3.79.150.56

# /opt/tornix is owned by the non-login tornix service user.
sudo -u tornix -H bash -lc '
  cd /opt/tornix &&
  git pull --ff-only origin feat+ec2-migration &&
  npm ci &&
  npm run lint &&
  npm run build:all
'

sudo systemctl restart tornix-api tornix-cert-worker
sudo systemctl is-active tornix-api tornix-cert-worker caddy
curl -fsS https://tornix-test.ailigent.ai/api/health
```

Caddy serves the frontend directly from `/opt/tornix/dist`; no Caddy restart is required for frontend-only changes. Do not run the Git/build commands as `ubuntu`, because `/opt/tornix` is owned by `tornix`.

## Certificate generation (server-side)

`POST /api/assessments` inserts the assessment and enqueues a row in `cert_jobs`. `tornix-cert-worker` claims queued jobs, renders the 2480×3508 certificate with Puppeteer/system Chromium using `shared/{branding,cert-template}.ts`, stores the PDF/PNG in MinIO, and updates the assessment metadata. The client polls `GET /api/assessments/:id/cert` and downloads through the authenticated API.

Layout knobs in `settings.data` JSONB: `nameY`, `serialY`, `nameColor`, `serialColor`, `fontFamily`, `serialFontSize`. Name font ladder is `template.ts → nameFontPx()`: 8/6.8/5.8/5/4.2/3.5 cqw at 15/22/28/35/45 char thresholds (1cqw = 24.8 px @ 2480px width).

**Gotchas:**

- `FONT_MAP` values **must use single quotes** (`'IBM Plex Sans Arabic', sans-serif`). Double quotes close the outer `style="..."` and silently drop every later declaration.
- Puppeteer PDF must use explicit `width:'2480px', height:'3508px'` — `format:'A4'` paginates the wide viewport across multiple pages.
- `src/App.tsx` polls `/api/settings/branding` every 30s — the Postgres `settings` row wins over code defaults. Change via AdminPanel or `UPDATE settings SET data = data || '{"nameY":44}'::jsonb WHERE key='branding';`.
- To re-render historical certificates after a layout change, clear the stored certificate metadata for the intended rows and run `npm run backfill:certs` to enqueue jobs.
- `tornix-test.ailigent.ai` currently resolves directly to the instance's public IPv4 address. If that address changes, update the Route 53 A record before deploying.
- `/opt/tornix/server-dist/` is generated and may appear untracked on the server; deploys rebuild it with `npm run build:server`.

## Environment (`.env.local`, owned on EC2 by `tornix`)

- `PUBLIC_BASE_URL`, `PORT`
- `DATABASE_URL`, optional `TEST_DATABASE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`
- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`
- `GEMINI_API_KEY`, `RESEND_API_KEY`, `VIMEO_ACCESS_TOKEN`
- `CHROMIUM_PATH` (defaults to `/usr/bin/chromium-browser`)

Never commit `.env.local` or print its values during deployment.

## History

- Migrated Firebase → Supabase in commit `591233b` (see `MIGRATION.md`).
- Added segmented course playback and server-side certificate generation in May 2026.
- Migrated production from Netlify/Supabase to the single EC2 stack on branch `feat+ec2-migration`; Route 53 records note the DNS migration on 2026-06-24.
