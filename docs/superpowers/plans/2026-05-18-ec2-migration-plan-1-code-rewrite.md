# EC2 Migration — Plan 1 of 3: Code Rewrite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-18-ec2-migration-design.md`

**Goal:** Replace the Netlify Functions backend + Supabase client with a self-hosted Node/Express API + Postgres + MinIO + Puppeteer-on-system-Chromium worker, all running locally against `docker compose`, with no behavior change visible to the SPA.

**Architecture:** Express HTTP server in `server/`, separate cert-renderer Node process in `worker/`, shared rendering code in `shared/`. Auth via custom Google OAuth + HS256 JWT, authz via Express middleware. Storage via `@aws-sdk/client-s3` against MinIO. Job durability via a `cert_jobs` Postgres table claimed with `SELECT … FOR UPDATE SKIP LOCKED`.

**Tech stack:** Node 22, TypeScript, Express 4, `pg`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `puppeteer-core`, `google-auth-library`, `jose`, vitest, tsx. Frontend: existing Vite + React 19 stack, minimal diffs.

**Branch & workspace:** Implement on a new worktree branched from `worktree-feat+segmented-course-player`, named `feat+ec2-migration`. Set up in Task 1.

**Plans 2 and 3 (separate documents)** cover EC2 provisioning and the data migration/cutover. This plan ends when the entire stack runs locally, all routes respond correctly, and `vitest run` is green.

---

## File Structure

```
.claude/worktrees/feat+ec2-migration/             # new git worktree
├── docker-compose.dev.yml                        # NEW: local Postgres + MinIO
├── package.json                                  # MODIFIED: deps + scripts
├── tsconfig.json                                 # existing, used by Vite (frontend)
├── tsconfig.server.json                          # NEW: server/worker build config
├── vitest.config.ts                              # MODIFIED: add node project
├── vitest.server.config.ts                       # NEW: server-side test config
├── .env.example                                  # MODIFIED: new env vars
│
├── server/
│   ├── index.ts                                  # express app entry
│   ├── env.ts                                    # parse + validate env
│   ├── db.ts                                     # pg Pool, q(sql, params) helper
│   ├── storage.ts                                # S3 client + putCertificate + presignedGet
│   ├── auth.ts                                   # google OAuth start/callback, JWT sign/verify
│   ├── middleware.ts                             # requireAuth, requireAdmin
│   ├── job-queue.ts                              # enqueueCertJob()
│   └── routes/
│       ├── health.ts
│       ├── auth.ts
│       ├── me.ts
│       ├── courses.ts
│       ├── settings-branding.ts
│       ├── assessments.ts
│       ├── assessment-cert.ts
│       ├── segmented-courses.ts
│       ├── progress.ts
│       ├── transcript.ts
│       └── send-email.ts
│
├── worker/
│   ├── index.ts                                  # polling loop
│   └── render.ts                                 # puppeteer-driven render + upload
│
├── shared/
│   ├── branding.ts                               # ported, pg-based
│   └── cert-template.ts                          # ported, unchanged
│
├── server/__tests__/                             # vitest, node env
│   ├── db.test.ts
│   ├── storage.test.ts
│   ├── auth.test.ts
│   ├── middleware.test.ts
│   ├── routes-me.test.ts
│   ├── routes-courses.test.ts
│   ├── routes-assessments.test.ts
│   └── routes-assessment-cert.test.ts
│
├── worker/__tests__/
│   ├── job-queue.test.ts
│   └── polling.test.ts
│
├── db/
│   ├── schema.sql                                # existing
│   └── migrations/
│       └── 003_cert_jobs.sql                     # NEW
│
├── src/                                          # existing Vite frontend
│   ├── api.ts                                    # MODIFIED: localStorage JWT
│   ├── useSession.ts                             # REWRITTEN
│   ├── supabase.ts                               # DELETED
│   ├── App.tsx                                   # MODIFIED: OAuth callback handling
│   └── …                                         # other files untouched
│
└── netlify/, netlify.toml, .netlify/             # DELETED (Task 22)
```

---

## Conventions used throughout this plan

- All commands run from the worktree root: `cd .claude/worktrees/feat+ec2-migration`.
- All `psql` commands run against the dockerized Postgres on `localhost:5433` (avoids clashing with system Postgres).
- All `aws` / `mc` CLI commands point at `http://localhost:9100` (dockerized MinIO).
- Test database: `tornix_test`. Dev database: `tornix_accreditation`. The test suite re-creates `tornix_test` between runs via a global setup file (Task 3).
- Commit after each task. Push only when explicitly noted.
- The worktree starts from `worktree-feat+segmented-course-player` so all existing features (segmented player, server-side certs, etc.) are present.

---

### Task 1: Create the worktree and bring up local infra

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `.env.local` (gitignored)

- [ ] **Step 1: Create the worktree**

```bash
cd "/home/karem/projects/tornix test/Tornix.Accreditation"
git worktree add -b feat+ec2-migration .claude/worktrees/feat+ec2-migration worktree-feat+segmented-course-player
cd .claude/worktrees/feat+ec2-migration
git status
```

Expected: clean working tree on `feat+ec2-migration`.

- [ ] **Step 2: Write `docker-compose.dev.yml`**

```yaml
# Local-only infra. Production runs the same software via systemd on EC2.
# Ports chosen to avoid clashes with system Postgres (5432) / system MinIO (9000).
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: tornix
      POSTGRES_PASSWORD: tornix_dev
      POSTGRES_DB: tornix_accreditation
    ports:
      - "127.0.0.1:5433:5432"
    volumes:
      - tornix_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tornix -d tornix_accreditation"]
      interval: 2s
      timeout: 2s
      retries: 20

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9101"
    environment:
      MINIO_ROOT_USER: tornixdev
      MINIO_ROOT_PASSWORD: tornixdev_secret
    ports:
      - "127.0.0.1:9100:9000"
      - "127.0.0.1:9101:9101"
    volumes:
      - tornix_minio:/data
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:9000/minio/health/ready"]
      interval: 2s
      timeout: 2s
      retries: 20

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 tornixdev tornixdev_secret &&
      mc mb --ignore-existing local/certificates &&
      mc anonymous set none local/certificates
      "

volumes:
  tornix_pg: {}
  tornix_minio: {}
```

- [ ] **Step 3: Start infra and verify**

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
```

Expected: `postgres` and `minio` show "healthy", `minio-init` shows "Exited (0)".

- [ ] **Step 4: Initialize the dev database with existing schema**

```bash
PGPASSWORD=tornix_dev psql -h localhost -p 5433 -U tornix tornix_accreditation \
  -f db/schema.sql \
  -f db/migrations/001_segmented_courses.sql \
  -f db/migrations/002_cert_columns.sql
```

Expected: no errors. `\dt` shows `users`, `settings`, `courses`, `assessments`, `oauth_state`, `segmented_courses`, `course_segments`.

- [ ] **Step 5: Write `.env.local` (gitignored)**

```bash
cat > .env.local <<'EOF'
NODE_ENV=development
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000

DATABASE_URL=postgres://tornix:tornix_dev@127.0.0.1:5433/tornix_accreditation
TEST_DATABASE_URL=postgres://tornix:tornix_dev@127.0.0.1:5433/tornix_test

# Use your real Google OAuth client; register http://localhost:3000/api/auth/google/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
JWT_SECRET=replace_with_openssl_rand_hex_32

S3_ENDPOINT=http://127.0.0.1:9100
S3_REGION=us-east-1
S3_ACCESS_KEY=tornixdev
S3_SECRET_KEY=tornixdev_secret
S3_BUCKET=certificates
S3_FORCE_PATH_STYLE=true

GEMINI_API_KEY=
RESEND_API_KEY=
VIMEO_ACCESS_TOKEN=

CHROMIUM_PATH=/usr/bin/chromium-browser
EOF
echo ".env.local" >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.dev.yml .gitignore
git commit -m "feat(infra): docker-compose for local Postgres + MinIO"
```

---

### Task 2: Server skeleton + health route

**Files:**
- Create: `tsconfig.server.json`
- Create: `vitest.server.config.ts`
- Create: `server/env.ts`
- Create: `server/index.ts`
- Create: `server/routes/health.ts`
- Create: `server/__tests__/health.test.ts`
- Modify: `package.json` (scripts + deps)

- [ ] **Step 1: Install dependencies**

```bash
npm install express @types/express dotenv
npm install -D supertest @types/supertest
```

Expected: package.json adds the new deps; no errors.

- [ ] **Step 2: Write `tsconfig.server.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "server-dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["server/**/*.ts", "worker/**/*.ts", "shared/**/*.ts"],
  "exclude": ["**/__tests__/**", "**/*.test.ts"]
}
```

- [ ] **Step 3: Write `vitest.server.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'worker/**/*.test.ts'],
    globals: true,
    setupFiles: ['./server/__tests__/setup.ts'],
  },
});
```

- [ ] **Step 4: Add npm scripts (`package.json`)**

Add inside `"scripts"`:

```json
"server:dev": "tsx --watch --env-file=.env.local server/index.ts",
"worker:dev": "tsx --watch --env-file=.env.local worker/index.ts",
"build:server": "tsc -p tsconfig.server.json",
"test:server": "vitest run --config vitest.server.config.ts",
"test:server:watch": "vitest --config vitest.server.config.ts"
```

- [ ] **Step 5: Write `server/env.ts`**

```ts
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  PUBLIC_BASE_URL: req('PUBLIC_BASE_URL'),
  DATABASE_URL: req('DATABASE_URL'),
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
  GOOGLE_CLIENT_ID: req('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: req('GOOGLE_CLIENT_SECRET'),
  JWT_SECRET: req('JWT_SECRET'),
  S3_ENDPOINT: req('S3_ENDPOINT'),
  S3_REGION: req('S3_REGION'),
  S3_ACCESS_KEY: req('S3_ACCESS_KEY'),
  S3_SECRET_KEY: req('S3_SECRET_KEY'),
  S3_BUCKET: req('S3_BUCKET'),
  S3_FORCE_PATH_STYLE: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  VIMEO_ACCESS_TOKEN: process.env.VIMEO_ACCESS_TOKEN ?? '',
  CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
};
```

- [ ] **Step 6: Write `server/__tests__/setup.ts` (placeholder for now)**

```ts
// Global test setup — task-specific setup gets added in later tasks
// (test DB reset, mocks, etc.). Empty file keeps vitest happy.
export {};
```

- [ ] **Step 7: Write the failing test `server/__tests__/health.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../index';

describe('GET /api/health', () => {
  it('returns 200 with ok: true', async () => {
    const app = buildApp({ skipDbCheck: true, skipStorageCheck: true });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 8: Run test, verify it fails**

```bash
npm run test:server -- health
```

Expected: FAIL (module `../index` not found).

- [ ] **Step 9: Write `server/routes/health.ts`**

```ts
import { Router } from 'express';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';

export function healthRouter(opts: { db?: Pool; s3?: S3Client }) {
  const r = Router();
  r.get('/health', async (_req, res) => {
    const out: Record<string, unknown> = { ok: true };
    if (opts.db) {
      try { await opts.db.query('SELECT 1'); out.db = 'up'; }
      catch { out.ok = false; out.db = 'down'; }
    }
    res.status(out.ok ? 200 : 503).json(out);
  });
  return r;
}
```

- [ ] **Step 10: Write `server/index.ts`**

```ts
import express, { type Express } from 'express';
import { healthRouter } from './routes/health';

export function buildApp(opts: { skipDbCheck?: boolean; skipStorageCheck?: boolean } = {}): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', healthRouter({}));
  return app;
}

// Allow `tsx server/index.ts` to start a real server, but also export buildApp for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { env } = await import('./env');
  const app = buildApp();
  app.listen(env.PORT, () => console.log(`[server] listening on :${env.PORT}`));
}
```

- [ ] **Step 11: Run test, verify it passes**

```bash
npm run test:server -- health
```

Expected: PASS.

- [ ] **Step 12: Smoke-test the dev server**

```bash
npm run server:dev &
SERVER_PID=$!
sleep 2
curl -fsS http://localhost:3000/api/health
kill $SERVER_PID
```

Expected: `{"ok":true}`.

- [ ] **Step 13: Commit**

```bash
git add tsconfig.server.json vitest.server.config.ts server/ package.json package-lock.json
git commit -m "feat(server): express skeleton + /api/health"
```

---

### Task 3: Database module (`server/db.ts`)

**Files:**
- Create: `server/db.ts`
- Create: `server/__tests__/db.test.ts`
- Modify: `server/__tests__/setup.ts` (test DB lifecycle)

- [ ] **Step 1: Add `pg` (already in deps) and write the failing test `server/__tests__/db.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { makeDb } from '../db';

describe('db.q', () => {
  let pool: Pool;
  const db = makeDb(() => pool);

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });
  afterAll(async () => { await pool.end(); });

  it('runs a simple SELECT', async () => {
    const { rows } = await db.q<{ n: number }>('SELECT 1::int AS n');
    expect(rows[0].n).toBe(1);
  });

  it('parameterizes safely', async () => {
    const { rows } = await db.q<{ x: string }>('SELECT $1::text AS x', ['hi']);
    expect(rows[0].x).toBe('hi');
  });

  it('runs a transaction with rollback on throw', async () => {
    await db.q('CREATE TEMP TABLE t (n int)');
    await expect(db.tx(async (c) => {
      await c.query('INSERT INTO t VALUES (1)');
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const { rows } = await db.q<{ n: number }>('SELECT count(*)::int AS n FROM t');
    expect(rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test:server -- db
```

Expected: FAIL — module `../db` not found.

- [ ] **Step 3: Write `server/db.ts`**

```ts
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from './env';

let _pool: Pool | undefined;
function defaultPool() {
  if (!_pool) _pool = new Pool({ connectionString: env.DATABASE_URL });
  return _pool;
}

export function makeDb(getPool: () => Pool = defaultPool) {
  return {
    pool: getPool,
    async q<R extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<R>> {
      return getPool().query<R>(sql, params);
    },
    async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
      const c = await getPool().connect();
      try {
        await c.query('BEGIN');
        const out = await fn(c);
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export const db = makeDb();
export type Db = ReturnType<typeof makeDb>;
```

- [ ] **Step 4: Add the test-DB lifecycle to `server/__tests__/setup.ts`**

```ts
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Drop+recreate tornix_test before the suite runs. Cheap (single connection,
// no data), keeps tests deterministic.
const adminUrl = process.env.DATABASE_URL!.replace(/\/[^/]+$/, '/postgres');
const testUrl = process.env.TEST_DATABASE_URL!;
const testDbName = testUrl.match(/\/([^/?]+)(\?|$)/)![1];

function psql(url: string, sql: string) {
  execSync(`psql "${url}" -c "${sql}"`, { stdio: 'pipe' });
}

beforeAll(() => {
  // Disconnect all sessions, drop, recreate
  psql(adminUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${testDbName}'`);
  psql(adminUrl, `DROP DATABASE IF EXISTS ${testDbName}`);
  psql(adminUrl, `CREATE DATABASE ${testDbName}`);
  // Apply schema + migrations
  execSync(`psql "${testUrl}" -f db/schema.sql -f db/migrations/001_segmented_courses.sql -f db/migrations/002_cert_columns.sql`, { stdio: 'pipe' });
});
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npm run test:server -- db
```

Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
git add server/db.ts server/__tests__/db.test.ts server/__tests__/setup.ts
git commit -m "feat(server): pg pool wrapper with tx helper + integration tests"
```

---

### Task 4: Storage module (`server/storage.ts`)

**Files:**
- Create: `server/storage.ts`
- Create: `server/__tests__/storage.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Write the failing test `server/__tests__/storage.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeStorage } from '../storage';

describe('storage', () => {
  const s = makeStorage({
    endpoint: 'http://127.0.0.1:9100',
    region: 'us-east-1',
    forcePathStyle: true,
    bucket: 'certificates',
    accessKey: 'tornixdev',
    secretKey: 'tornixdev_secret',
  });

  it('round-trips a buffer and returns a presigned URL', async () => {
    const path = `__test__/${Date.now()}.txt`;
    const body = Buffer.from('hello tornix', 'utf8');
    await s.put(path, body, 'text/plain');

    const url = await s.presignedGet(path, 30);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:9100\/certificates\/__test__\//);

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello tornix');
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
npm run test:server -- storage
```

Expected: FAIL — module `../storage` not found.

- [ ] **Step 4: Write `server/storage.ts`**

```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

export interface StorageOpts {
  endpoint: string; region: string; forcePathStyle: boolean;
  bucket: string; accessKey: string; secretKey: string;
}

export function makeStorage(opts: StorageOpts) {
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: opts.forcePathStyle,
    credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
  });
  return {
    client,
    bucket: opts.bucket,
    async put(key: string, body: Buffer, contentType: string) {
      await client.send(new PutObjectCommand({
        Bucket: opts.bucket, Key: key, Body: body, ContentType: contentType,
      }));
    },
    async presignedGet(key: string, ttlSeconds = 60 * 60) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: opts.bucket, Key: key,
      }), { expiresIn: ttlSeconds });
    },
  };
}

export const storage = makeStorage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  bucket: env.S3_BUCKET,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});

export type Storage = ReturnType<typeof makeStorage>;
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm run test:server -- storage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts server/__tests__/storage.test.ts package.json package-lock.json
git commit -m "feat(server): MinIO/S3 wrapper with presigned GET"
```

---

### Task 5: JWT sign/verify helpers (`server/auth.ts` part 1)

**Files:**
- Create: `server/auth.ts` (partial; OAuth callback added in Task 6)
- Create: `server/__tests__/auth-jwt.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install jose google-auth-library
```

- [ ] **Step 2: Write failing test `server/__tests__/auth-jwt.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../auth';

const fakeSecret = 'a'.repeat(64);
process.env.JWT_SECRET = fakeSecret;

describe('JWT session', () => {
  it('round-trips a session payload', async () => {
    const jwt = await signSession({
      userId: '42', email: 'k@example.com', name: 'K', picture: null, isAdmin: false,
    });
    const got = await verifySession(jwt);
    expect(got.userId).toBe('42');
    expect(got.email).toBe('k@example.com');
    expect(got.isAdmin).toBe(false);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const orig = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'b'.repeat(64);
    const jwt = await signSession({
      userId: '1', email: 'x@x', name: null, picture: null, isAdmin: false,
    });
    process.env.JWT_SECRET = orig;
    await expect(verifySession(jwt)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
npm run test:server -- auth-jwt
```

Expected: FAIL — module `../auth` not found.

- [ ] **Step 4: Write `server/auth.ts` (JWT helpers only for now)**

```ts
import { SignJWT, jwtVerify } from 'jose';

export interface SessionPayload {
  userId: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
}

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export async function signSession(s: SessionPayload, ttl: string = '7d'): Promise<string> {
  return new SignJWT({
    email: s.email, name: s.name, picture: s.picture, is_admin: s.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret());
  return {
    userId: payload.sub!,
    email: payload.email as string,
    name: (payload.name as string | null) ?? null,
    picture: (payload.picture as string | null) ?? null,
    isAdmin: !!payload.is_admin,
  };
}
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm run test:server -- auth-jwt
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/auth.ts server/__tests__/auth-jwt.test.ts package.json package-lock.json
git commit -m "feat(server): JWT sign/verify helpers"
```

---

### Task 6: Google OAuth start + callback (`server/auth.ts` part 2)

**Files:**
- Modify: `server/auth.ts`
- Create: `server/routes/auth.ts`
- Create: `server/__tests__/auth-oauth.test.ts`

- [ ] **Step 1: Write failing test `server/__tests__/auth-oauth.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { authRouter } from '../routes/auth';
import { makeDb } from '../db';

process.env.JWT_SECRET = 'a'.repeat(64);

// Mock google-auth-library so the test never hits Google.
vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: class {
      generateAuthUrl(opts: any) {
        return `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}`;
      }
      async getToken(_code: string) {
        return { tokens: { id_token: 'fake-id-token' } };
      }
      async verifyIdToken(_opts: any) {
        return {
          getPayload: () => ({
            sub: 'google-sub-123',
            email: 'k@example.com',
            email_verified: true,
            name: 'Karem',
            picture: 'https://example.com/pic.jpg',
          }),
        };
      }
    },
  };
});

function makeApp(pool: Pool) {
  const app = express();
  app.use(authRouter({ db: makeDb(() => pool), publicBaseUrl: 'http://localhost:3000' }));
  return app;
}

describe('GET /api/auth/google → /callback', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE oauth_state, users RESTART IDENTITY CASCADE');
  });

  it('start: stores state and redirects to google', async () => {
    const res = await request(makeApp(pool)).get('/api/auth/google?next=/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com.*state=/);
    const { rows } = await pool.query('SELECT state FROM oauth_state');
    expect(rows).toHaveLength(1);
  });

  it('callback: validates state, upserts user, redirects with token in fragment', async () => {
    await pool.query(`INSERT INTO oauth_state (state, payload) VALUES ('xyz', $1)`,
                     [JSON.stringify({ next: '/dashboard' })]);
    const res = await request(makeApp(pool)).get('/api/auth/google/callback?code=c&state=xyz');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/dashboard#token=eyJ/);
    const { rows } = await pool.query('SELECT email, google_sub FROM users');
    expect(rows[0]).toMatchObject({ email: 'k@example.com', google_sub: 'google-sub-123' });
    const stale = await pool.query('SELECT count(*) FROM oauth_state');
    expect(stale.rows[0].count).toBe('0');     // state row consumed
  });

  it('callback: rejects unknown state', async () => {
    const res = await request(makeApp(pool)).get('/api/auth/google/callback?code=c&state=missing');
    expect(res.status).toBe(400);
  });
});
```

You also need to add the `oauth_state.payload` column. The base schema has only `(state, created_at)`. Add it now:

```sql
-- This goes inline in the test setup via psql, but is also part of the
-- production migration. We add it in Task 7 too, but the test DB needs it.
ALTER TABLE oauth_state ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
```

Run that against `tornix_test` once now (or extend `server/__tests__/setup.ts` Step 4 of Task 3 to include it):

```bash
PGPASSWORD=tornix_dev psql -h localhost -p 5433 -U tornix tornix_accreditation \
  -c "ALTER TABLE oauth_state ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb"
```

Also update `server/__tests__/setup.ts` to include `db/migrations/004_oauth_state_payload.sql` (we'll create the file in Step 3).

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test:server -- auth-oauth
```

Expected: FAIL — `../routes/auth` not found.

- [ ] **Step 3: Create migration `db/migrations/004_oauth_state_payload.sql`**

```sql
ALTER TABLE oauth_state ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
```

Then update `server/__tests__/setup.ts` to apply this migration after the others:

```ts
execSync(`psql "${testUrl}" -f db/schema.sql -f db/migrations/001_segmented_courses.sql -f db/migrations/002_cert_columns.sql -f db/migrations/004_oauth_state_payload.sql`, { stdio: 'pipe' });
```

(Migration `003` is `cert_jobs`, created in Task 14. We add it here in a later task; for now Task 6 only needs `004`.)

- [ ] **Step 4: Extend `server/auth.ts` with OAuth helpers**

Add to `server/auth.ts`:

```ts
import { OAuth2Client } from 'google-auth-library';
import type { Db } from './db';

export interface AuthCtx {
  db: Db;
  publicBaseUrl: string;
  clientId?: string;       // injectable for tests
  clientSecret?: string;
}

export function googleClient(ctx: AuthCtx) {
  return new OAuth2Client({
    clientId: ctx.clientId ?? process.env.GOOGLE_CLIENT_ID!,
    clientSecret: ctx.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: `${ctx.publicBaseUrl}/api/auth/google/callback`,
  });
}

export async function startGoogleAuth(ctx: AuthCtx, opts: { state: string; next: string }) {
  await ctx.db.q(
    `INSERT INTO oauth_state (state, payload) VALUES ($1, $2)`,
    [opts.state, JSON.stringify({ next: opts.next })],
  );
  return googleClient(ctx).generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state: opts.state,
    prompt: 'select_account',
    access_type: 'online',
  });
}

export async function consumeGoogleCallback(ctx: AuthCtx, opts: { code: string; state: string }) {
  const { rows } = await ctx.db.q<{ payload: { next?: string } }>(
    `DELETE FROM oauth_state
     WHERE state = $1 AND created_at > now() - interval '10 minutes'
     RETURNING payload`,
    [opts.state],
  );
  if (!rows.length) throw new Error('invalid or expired state');
  const next = rows[0].payload.next || '/';

  const client = googleClient(ctx);
  const { tokens } = await client.getToken(opts.code);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token!,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const p = ticket.getPayload()!;
  const email = (p.email ?? '').toLowerCase();
  if (!email || !p.email_verified) throw new Error('unverified google email');

  const upsert = await ctx.db.q<{ id: number; email: string; name: string | null; photo_url: string | null; is_admin: boolean }>(
    `INSERT INTO users (email, google_sub, name, photo_url, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (email) DO UPDATE
       SET google_sub = EXCLUDED.google_sub,
           name = COALESCE(users.name, EXCLUDED.name),
           photo_url = EXCLUDED.photo_url,
           last_login_at = now()
     RETURNING id, email, name, photo_url, is_admin`,
    [email, p.sub, p.name ?? null, p.picture ?? null],
  );
  const u = upsert.rows[0];
  const jwt = await signSession({
    userId: String(u.id),
    email: u.email,
    name: u.name,
    picture: u.photo_url,
    isAdmin: u.is_admin,
  });
  return { next, jwt };
}
```

- [ ] **Step 5: Write `server/routes/auth.ts`**

```ts
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { startGoogleAuth, consumeGoogleCallback, type AuthCtx } from '../auth';

export function authRouter(ctx: AuthCtx) {
  const r = Router();

  r.get('/api/auth/google', async (req, res) => {
    const state = randomUUID();
    const next = (req.query.next as string) || '/';
    const url = await startGoogleAuth(ctx, { state, next });
    res.redirect(302, url);
  });

  r.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code || !state) return res.status(400).send('missing code or state');
      const { next, jwt } = await consumeGoogleCallback(ctx, { code, state });
      const safeNext = next.startsWith('/') ? next : '/';
      res.redirect(302, `${safeNext}#token=${jwt}`);
    } catch (e: any) {
      res.status(400).send(`oauth callback failed: ${e?.message || 'unknown'}`);
    }
  });

  return r;
}
```

- [ ] **Step 6: Run test, verify it passes**

```bash
npm run test:server -- auth-oauth
```

Expected: PASS (all three sub-cases).

- [ ] **Step 7: Commit**

```bash
git add server/auth.ts server/routes/auth.ts server/__tests__/auth-oauth.test.ts server/__tests__/setup.ts db/migrations/004_oauth_state_payload.sql
git commit -m "feat(server): google oauth start + callback"
```

---

### Task 7: Auth middleware (`server/middleware.ts`)

**Files:**
- Create: `server/middleware.ts`
- Create: `server/__tests__/middleware.test.ts`

- [ ] **Step 1: Write failing test `server/__tests__/middleware.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireAuth, requireAdmin } from '../middleware';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

function app() {
  const a = express();
  a.get('/whoami', requireAuth, (req, res) => res.json((req as any).user));
  a.get('/admin', requireAuth, requireAdmin, (_req, res) => res.json({ ok: true }));
  return a;
}

async function token(p: Partial<Parameters<typeof signSession>[0]> = {}) {
  return signSession({
    userId: '1', email: 'u@example.com', name: null, picture: null, isAdmin: false, ...p,
  });
}

describe('middleware', () => {
  it('401 without auth header', async () => {
    const res = await request(app()).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('401 on bad token', async () => {
    const res = await request(app()).get('/whoami').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('200 with valid token, exposes req.user', async () => {
    const t = await token({ email: 'k@example.com' });
    const res = await request(app()).get('/whoami').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('k@example.com');
  });

  it('403 when admin route accessed by non-admin', async () => {
    const t = await token();
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });

  it('200 when admin route accessed by admin', async () => {
    const t = await token({ isAdmin: true });
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test:server -- middleware
```

Expected: FAIL — `../middleware` not found.

- [ ] **Step 3: Write `server/middleware.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionPayload } from './auth';

declare module 'express-serve-static-core' {
  interface Request { user?: SessionPayload }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).end();
  try {
    req.user = await verifySession(h.slice(7));
    next();
  } catch {
    res.status(401).end();
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) return res.status(403).end();
  next();
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm run test:server -- middleware
```

Expected: PASS (5 sub-cases).

- [ ] **Step 5: Commit**

```bash
git add server/middleware.ts server/__tests__/middleware.test.ts
git commit -m "feat(server): requireAuth + requireAdmin middleware"
```

---

### Task 8: `me` and `health` routes wired into app + admin bootstrap

**Files:**
- Modify: `server/index.ts`
- Create: `server/routes/me.ts`
- Create: `server/__tests__/routes-me.test.ts`

- [ ] **Step 1: Write failing test `server/__tests__/routes-me.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

describe('GET /api/me', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, name, photo_url, is_admin)
                      VALUES (42, 'k@example.com', 'Karem', 'pic.jpg', true)`);
  });

  it('401 without token', async () => {
    const app = buildApp({ poolOverride: pool });
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('returns profile from DB (source of truth, not the JWT claims)', async () => {
    const t = await signSession({
      userId: '42', email: 'k@example.com', name: 'Stale Name', picture: null, isAdmin: false,
    });
    const app = buildApp({ poolOverride: pool });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 42, email: 'k@example.com', name: 'Karem', is_admin: true,
    });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test:server -- routes-me
```

Expected: FAIL.

- [ ] **Step 3: Write `server/routes/me.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware';
import type { Db } from '../db';

export function meRouter(ctx: { db: Db }) {
  const r = Router();
  r.get('/api/me', requireAuth, async (req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT id, email, name, photo_url, is_admin, created_at, last_login_at
       FROM users WHERE id = $1`,
      [req.user!.userId],
    );
    if (!rows.length) return res.status(404).end();
    res.json(rows[0]);
  });
  return r;
}
```

- [ ] **Step 4: Wire `me` + `auth` into `server/index.ts`**

Rewrite `server/index.ts`:

```ts
import express, { type Express } from 'express';
import { Pool } from 'pg';
import { makeDb } from './db';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { meRouter } from './routes/me';

export interface BuildAppOpts {
  poolOverride?: Pool;
  publicBaseUrl?: string;
}

export function buildApp(opts: BuildAppOpts = {}): Express {
  const pool = opts.poolOverride ?? new Pool({ connectionString: process.env.DATABASE_URL });
  const db = makeDb(() => pool);
  const publicBaseUrl = opts.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', healthRouter({ db: pool }));
  app.use(authRouter({ db, publicBaseUrl }));
  app.use(meRouter({ db }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { env } = await import('./env');
  const app = buildApp();
  app.listen(env.PORT, () => console.log(`[server] listening on :${env.PORT}`));
}
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm run test:server -- routes-me
```

Expected: PASS (both sub-cases).

- [ ] **Step 6: Commit**

```bash
git add server/index.ts server/routes/me.ts server/__tests__/routes-me.test.ts
git commit -m "feat(server): /api/me route + wire auth into app"
```

---

### Task 9: Courses + settings-branding routes

**Files:**
- Read first to mirror behavior: `netlify/functions/courses.ts`, `netlify/functions/settings-branding.ts`
- Create: `server/routes/courses.ts`
- Create: `server/routes/settings-branding.ts`
- Create: `server/__tests__/routes-courses.test.ts`
- Create: `server/__tests__/routes-settings.test.ts`
- Modify: `server/index.ts` (mount the new routers)

- [ ] **Step 1: Read the source you're porting**

```bash
cat netlify/functions/courses.ts
cat netlify/functions/settings-branding.ts
```

Note: `courses.ts` exposes `GET /api/courses` (auth-required), admin-only POST/PUT/DELETE. `settings-branding.ts` is public-read GET, admin-only PATCH; bytea blobs (`logo_bytes`, `badge_bytes`, `cert_bg_bytes`) are returned as base64 in JSON.

- [ ] **Step 2: Write the failing test `server/__tests__/routes-courses.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

async function admin() {
  return signSession({ userId: '1', email: 'admin@x', name: null, picture: null, isAdmin: true });
}
async function user() {
  return signSession({ userId: '2', email: 'u@x', name: null, picture: null, isAdmin: false });
}

describe('routes/courses', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE courses, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES (1, 'admin@x', true), (2, 'u@x', false)`);
    await pool.query(`INSERT INTO courses (title, chapters) VALUES ('TCP', '[]'::jsonb)`);
  });

  it('GET /api/courses requires auth', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get('/api/courses');
    expect(r.status).toBe(401);
  });

  it('GET /api/courses returns rows for any authed user', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get('/api/courses').set('Authorization', `Bearer ${await user()}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].title).toBe('TCP');
  });

  it('POST /api/courses rejects non-admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).post('/api/courses')
      .set('Authorization', `Bearer ${await user()}`)
      .send({ title: 'New', chapters: [] });
    expect(r.status).toBe(403);
  });

  it('POST /api/courses creates a course for admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).post('/api/courses')
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ title: 'New', video_url: 'https://v', chapters: [] });
    expect(r.status).toBe(200);
    expect(r.body.title).toBe('New');
  });

  it('DELETE /api/courses/:id admin only', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).delete('/api/courses/1').set('Authorization', `Bearer ${await admin()}`);
    expect(r.status).toBe(204);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM courses');
    expect(rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
npm run test:server -- routes-courses
```

Expected: FAIL.

- [ ] **Step 4: Write `server/routes/courses.ts`**

```ts
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware';
import type { Db } from '../db';

export function coursesRouter(ctx: { db: Db }) {
  const r = Router();

  r.get('/api/courses', requireAuth, async (_req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT id, title, video_url, chapters, created_at
       FROM courses ORDER BY created_at DESC`,
    );
    res.json(rows);
  });

  r.post('/api/courses', requireAuth, requireAdmin, async (req, res) => {
    const { title, video_url, chapters } = req.body ?? {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await ctx.db.q(
      `INSERT INTO courses (title, video_url, chapters)
       VALUES ($1, $2, $3::jsonb) RETURNING id, title, video_url, chapters, created_at`,
      [title, video_url ?? null, JSON.stringify(chapters ?? [])],
    );
    res.json(rows[0]);
  });

  r.put('/api/courses/:id', requireAuth, requireAdmin, async (req, res) => {
    const { title, video_url, chapters } = req.body ?? {};
    const { rows } = await ctx.db.q(
      `UPDATE courses SET title = $2, video_url = $3, chapters = $4::jsonb
       WHERE id = $1 RETURNING id, title, video_url, chapters, created_at`,
      [req.params.id, title, video_url ?? null, JSON.stringify(chapters ?? [])],
    );
    if (!rows.length) return res.status(404).end();
    res.json(rows[0]);
  });

  r.delete('/api/courses/:id', requireAuth, requireAdmin, async (req, res) => {
    await ctx.db.q(`DELETE FROM courses WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  });

  return r;
}
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm run test:server -- routes-courses
```

Expected: PASS.

- [ ] **Step 6: Write the failing test `server/__tests__/routes-settings.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

describe('routes/settings-branding', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE settings, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES (1, 'a@x', true), (2, 'u@x', false)`);
    await pool.query(`INSERT INTO settings (key, data, logo_bytes, logo_mime)
                      VALUES ('branding', $1::jsonb, decode('48656c6c6f', 'hex'), 'image/png')`,
                     [JSON.stringify({ nameY: 44, nameColor: '#000' })]);
  });

  it('GET /api/settings/branding is public, returns base64 bytea', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get('/api/settings/branding');
    expect(r.status).toBe(200);
    expect(r.body.data.nameY).toBe(44);
    expect(r.body.logo_b64).toBe(Buffer.from('Hello').toString('base64'));
    expect(r.body.logo_mime).toBe('image/png');
  });

  it('PATCH /api/settings/branding rejects non-admin', async () => {
    const t = await signSession({ userId: '2', email: 'u@x', name: null, picture: null, isAdmin: false });
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).patch('/api/settings/branding')
      .set('Authorization', `Bearer ${t}`).send({ data: { nameY: 50 } });
    expect(r.status).toBe(403);
  });

  it('PATCH /api/settings/branding merges JSONB for admin', async () => {
    const t = await signSession({ userId: '1', email: 'a@x', name: null, picture: null, isAdmin: true });
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).patch('/api/settings/branding')
      .set('Authorization', `Bearer ${t}`).send({ data: { nameY: 50 } });
    expect(r.status).toBe(200);
    expect(r.body.data.nameY).toBe(50);
    expect(r.body.data.nameColor).toBe('#000');   // existing keys preserved
  });
});
```

- [ ] **Step 7: Run test, verify it fails**

```bash
npm run test:server -- routes-settings
```

Expected: FAIL.

- [ ] **Step 8: Write `server/routes/settings-branding.ts`**

```ts
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware';
import type { Db } from '../db';

function rowToBody(row: any) {
  return {
    key: row.key,
    data: row.data,
    logo_b64: row.logo_bytes ? Buffer.from(row.logo_bytes).toString('base64') : null,
    logo_mime: row.logo_mime,
    badge_b64: row.badge_bytes ? Buffer.from(row.badge_bytes).toString('base64') : null,
    badge_mime: row.badge_mime,
    cert_bg_b64: row.cert_bg_bytes ? Buffer.from(row.cert_bg_bytes).toString('base64') : null,
    cert_bg_mime: row.cert_bg_mime,
    updated_at: row.updated_at,
  };
}

export function settingsBrandingRouter(ctx: { db: Db }) {
  const r = Router();

  r.get('/api/settings/branding', async (_req, res) => {
    const { rows } = await ctx.db.q(`SELECT * FROM settings WHERE key='branding'`);
    if (!rows.length) return res.json({ key: 'branding', data: {}, logo_b64: null, badge_b64: null, cert_bg_b64: null });
    res.json(rowToBody(rows[0]));
  });

  r.patch('/api/settings/branding', requireAuth, requireAdmin, async (req, res) => {
    const body = req.body ?? {};
    // Build a dynamic update. data is JSONB-merged; bytea fields set if provided.
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (body.data) { sets.push(`data = data || $${i++}::jsonb`); params.push(JSON.stringify(body.data)); }
    if (typeof body.logo_b64 === 'string') {
      sets.push(`logo_bytes = decode($${i++}, 'base64')`); params.push(body.logo_b64);
      sets.push(`logo_mime = $${i++}`); params.push(body.logo_mime ?? 'image/png');
    }
    if (typeof body.badge_b64 === 'string') {
      sets.push(`badge_bytes = decode($${i++}, 'base64')`); params.push(body.badge_b64);
      sets.push(`badge_mime = $${i++}`); params.push(body.badge_mime ?? 'image/png');
    }
    if (typeof body.cert_bg_b64 === 'string') {
      sets.push(`cert_bg_bytes = decode($${i++}, 'base64')`); params.push(body.cert_bg_b64);
      sets.push(`cert_bg_mime = $${i++}`); params.push(body.cert_bg_mime ?? 'image/jpeg');
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    sets.push(`updated_at = now()`);

    const sql = `UPDATE settings SET ${sets.join(', ')} WHERE key='branding' RETURNING *`;
    const { rows } = await ctx.db.q(sql, params);
    if (!rows.length) return res.status(404).end();
    res.json(rowToBody(rows[0]));
  });

  return r;
}
```

- [ ] **Step 9: Wire the new routers in `server/index.ts`**

In `buildApp`, after `meRouter`:

```ts
import { coursesRouter } from './routes/courses';
import { settingsBrandingRouter } from './routes/settings-branding';
…
app.use(coursesRouter({ db }));
app.use(settingsBrandingRouter({ db }));
```

- [ ] **Step 10: Run tests, verify they pass**

```bash
npm run test:server -- routes-courses routes-settings
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add server/routes/courses.ts server/routes/settings-branding.ts server/__tests__/routes-courses.test.ts server/__tests__/routes-settings.test.ts server/index.ts
git commit -m "feat(server): /api/courses and /api/settings/branding routes"
```

---

### Task 10: `cert_jobs` migration + job-queue helper

**Files:**
- Create: `db/migrations/003_cert_jobs.sql`
- Create: `server/job-queue.ts`
- Create: `server/__tests__/job-queue.test.ts`
- Modify: `server/__tests__/setup.ts` (apply new migration)

- [ ] **Step 1: Write the migration `db/migrations/003_cert_jobs.sql`**

```sql
CREATE TABLE IF NOT EXISTS cert_jobs (
  id            BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed')),
  attempts      INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cert_jobs_pending_idx
  ON cert_jobs (status, created_at)
  WHERE status IN ('pending','running');
```

- [ ] **Step 2: Apply against dev DB and update test setup**

```bash
PGPASSWORD=tornix_dev psql -h localhost -p 5433 -U tornix tornix_accreditation -f db/migrations/003_cert_jobs.sql
```

In `server/__tests__/setup.ts`, extend the migration list to include `003_cert_jobs.sql`:

```ts
execSync(`psql "${testUrl}" -f db/schema.sql -f db/migrations/001_segmented_courses.sql -f db/migrations/002_cert_columns.sql -f db/migrations/003_cert_jobs.sql -f db/migrations/004_oauth_state_payload.sql`, { stdio: 'pipe' });
```

- [ ] **Step 3: Write the failing test `server/__tests__/job-queue.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { makeDb } from '../db';
import { enqueueCertJob } from '../job-queue';

describe('enqueueCertJob', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (10, 1, 'u@x', 80, 'Passed', '[]'::jsonb)`);
  });

  it('inserts a pending row', async () => {
    const db = makeDb(() => pool);
    await enqueueCertJob(db, 10);
    const { rows } = await pool.query(`SELECT assessment_id, status FROM cert_jobs`);
    expect(rows).toEqual([{ assessment_id: '10', status: 'pending' }]);
  });

  it('is idempotent for the same assessment when one is already pending', async () => {
    const db = makeDb(() => pool);
    await enqueueCertJob(db, 10);
    await enqueueCertJob(db, 10);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM cert_jobs WHERE assessment_id=10 AND status='pending'`);
    expect(rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 4: Run test, verify it fails**

```bash
npm run test:server -- job-queue
```

Expected: FAIL.

- [ ] **Step 5: Write `server/job-queue.ts`**

```ts
import type { Db } from './db';

/** Insert a pending cert_jobs row unless one is already pending or running for this assessment. */
export async function enqueueCertJob(db: Db, assessmentId: number): Promise<void> {
  await db.q(
    `INSERT INTO cert_jobs (assessment_id)
     SELECT $1
     WHERE NOT EXISTS (
       SELECT 1 FROM cert_jobs
       WHERE assessment_id = $1 AND status IN ('pending', 'running')
     )`,
    [assessmentId],
  );
}
```

- [ ] **Step 6: Run test, verify it passes**

```bash
npm run test:server -- job-queue
```

Expected: PASS (both sub-cases).

- [ ] **Step 7: Commit**

```bash
git add db/migrations/003_cert_jobs.sql server/job-queue.ts server/__tests__/job-queue.test.ts server/__tests__/setup.ts
git commit -m "feat(db): cert_jobs table + idempotent enqueue helper"
```

---

### Task 11: `assessments` route (list, create, enqueue)

**Files:**
- Create: `server/routes/assessments.ts`
- Create: `server/__tests__/routes-assessments.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Read the source to mirror**

```bash
cat netlify/functions/assessments.ts
```

Note the existing behavior: GET returns own assessments (admin sees all), POST inserts row and fires off the cert renderer. Status enum is `'Started' | 'completed' | 'terminated' | 'Passed' | 'Failed'`.

- [ ] **Step 2: Write the failing test `server/__tests__/routes-assessments.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

async function jwt(p: { email: string; isAdmin?: boolean; id: number }) {
  return signSession({ userId: String(p.id), email: p.email, name: null, picture: null, isAdmin: !!p.isAdmin });
}

describe('routes/assessments', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES
      (1, 'admin@x', true), (2, 'k@example.com', false), (3, 'other@x', false)`);
    await pool.query(`INSERT INTO assessments (user_id, user_email, score, status, answers) VALUES
      (2, 'k@example.com', 90, 'Passed', '[]'::jsonb),
      (3, 'other@x', 30, 'Failed', '[]'::jsonb)`);
  });

  it('GET /api/assessments returns only own rows for non-admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    const r = await request(app).get('/api/assessments').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].user_email).toBe('k@example.com');
  });

  it('GET /api/assessments returns all rows for admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 1, email: 'admin@x', isAdmin: true });
    const r = await request(app).get('/api/assessments').set('Authorization', `Bearer ${t}`);
    expect(r.body).toHaveLength(2);
  });

  it('POST /api/assessments inserts row and enqueues cert job for passing score', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    const r = await request(app).post('/api/assessments')
      .set('Authorization', `Bearer ${t}`)
      .send({
        score: 75, integrity_score: 95, status: 'Passed', answers: [],
        questions_count: 20, user_name: 'Karem', user_photo: null,
      });
    expect(r.status).toBe(200);
    expect(r.body.score).toBe('75');
    expect(r.body.user_email).toBe('k@example.com');

    const { rows } = await pool.query(`SELECT assessment_id, status FROM cert_jobs`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
  });

  it('POST /api/assessments does NOT enqueue cert job for failing score', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    await request(app).post('/api/assessments')
      .set('Authorization', `Bearer ${t}`)
      .send({ score: 40, integrity_score: 80, status: 'Failed', answers: [], questions_count: 20, user_name: 'K' });

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM cert_jobs`);
    expect(rows[0].n).toBe(0);
  });

  it('POST /api/assessments derives email from JWT (ignores any client-supplied email)', async () => {
    const app = buildApp({ poolOverride: pool });
    const t = await jwt({ id: 2, email: 'k@example.com' });
    const r = await request(app).post('/api/assessments')
      .set('Authorization', `Bearer ${t}`)
      .send({ score: 70, integrity_score: 80, status: 'Passed', answers: [], questions_count: 20,
              user_email: 'attacker@evil.com' });
    expect(r.body.user_email).toBe('k@example.com');
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
npm run test:server -- routes-assessments
```

Expected: FAIL.

- [ ] **Step 4: Write `server/routes/assessments.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware';
import type { Db } from '../db';
import { enqueueCertJob } from '../job-queue';

const COLUMNS = `id, user_id, user_email, user_name, user_photo, score, integrity_score,
                 serial_number, status, answers, questions_count, created_at,
                 cert_storage_path, cert_generated_at`;

export function assessmentsRouter(ctx: { db: Db }) {
  const r = Router();

  r.get('/api/assessments', requireAuth, async (req, res) => {
    const { rows } = req.user!.isAdmin
      ? await ctx.db.q(`SELECT ${COLUMNS} FROM assessments ORDER BY created_at DESC LIMIT 500`)
      : await ctx.db.q(
          `SELECT ${COLUMNS} FROM assessments
           WHERE lower(user_email) = lower($1) ORDER BY created_at DESC`,
          [req.user!.email],
        );
    res.json(rows);
  });

  r.post('/api/assessments', requireAuth, async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.score !== 'number') return res.status(400).json({ error: 'score required' });
    if (!b.status) return res.status(400).json({ error: 'status required' });

    // Derive identity from JWT, NEVER from client body.
    const email = req.user!.email;
    const userId = parseInt(req.user!.userId, 10);
    const userName = b.user_name ?? req.user!.name ?? null;
    const userPhoto = b.user_photo ?? req.user!.picture ?? null;
    const serial = `TCP-${Date.now()}-${userId}`;

    const inserted = await ctx.db.tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO assessments
         (user_id, user_email, user_name, user_photo, score, integrity_score,
          serial_number, status, answers, questions_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         RETURNING ${COLUMNS}`,
        [userId, email, userName, userPhoto, b.score, b.integrity_score ?? 0,
         serial, b.status, JSON.stringify(b.answers ?? []), b.questions_count ?? null],
      );
      const row = rows[0];
      if (Number(row.score) >= 60) {
        await c.query(
          `INSERT INTO cert_jobs (assessment_id)
           SELECT $1
           WHERE NOT EXISTS (
             SELECT 1 FROM cert_jobs WHERE assessment_id=$1 AND status IN ('pending','running')
           )`,
          [row.id],
        );
      }
      return row;
    });

    res.json(inserted);
  });

  return r;
}
```

- [ ] **Step 5: Wire in `server/index.ts`**

```ts
import { assessmentsRouter } from './routes/assessments';
…
app.use(assessmentsRouter({ db }));
```

- [ ] **Step 6: Run test, verify it passes**

```bash
npm run test:server -- routes-assessments
```

Expected: PASS (all 5 sub-cases).

- [ ] **Step 7: Commit**

```bash
git add server/routes/assessments.ts server/__tests__/routes-assessments.test.ts server/index.ts
git commit -m "feat(server): /api/assessments (own-data filter + cert-job enqueue)"
```

---

### Task 12: `assessment-cert` poll route (presigned URL regen)

**Files:**
- Create: `server/routes/assessment-cert.ts`
- Create: `server/__tests__/routes-assessment-cert.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write failing test `server/__tests__/routes-assessment-cert.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';
import { storage } from '../storage';

process.env.JWT_SECRET = 'a'.repeat(64);

describe('GET /api/assessments/:id/cert', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES (1, 'k@example.com', false), (2, 'other@x', false)`);
  });

  it('returns 404 with status=pending when no cert yet', async () => {
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (10, 1, 'k@example.com', 80, 'Passed', '[]'::jsonb)`);
    const t = await signSession({ userId: '1', email: 'k@example.com', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/assessments/10/cert')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(404);
    expect(r.body.status).toBe('pending');
  });

  it('returns presigned URLs when cert_storage_path is set, after uploading test bytes', async () => {
    // Upload a dummy PDF + PNG to MinIO at the expected path
    await storage.put('k@example.com/11.pdf', Buffer.from('%PDF-fake'), 'application/pdf');
    await storage.put('k@example.com/11.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers, cert_storage_path, cert_generated_at)
                      VALUES (11, 1, 'k@example.com', 80, 'Passed', '[]'::jsonb, 'k@example.com/11.pdf', now())`);

    const t = await signSession({ userId: '1', email: 'k@example.com', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/assessments/11/cert')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ready');
    expect(r.body.cert_pdf_url).toMatch(/^http:\/\/127\.0\.0\.1:9100\/certificates\/k%40example\.com\/11\.pdf/);

    // The URL actually works
    const dl = await fetch(r.body.cert_pdf_url);
    expect(dl.status).toBe(200);
  });

  it('rejects access to another user’s cert (404, not 403, to avoid existence-leak)', async () => {
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (12, 2, 'other@x', 80, 'Passed', '[]'::jsonb)`);
    const t = await signSession({ userId: '1', email: 'k@example.com', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/assessments/12/cert')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm run test:server -- routes-assessment-cert
```

Expected: FAIL.

- [ ] **Step 3: Write `server/routes/assessment-cert.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware';
import type { Db } from '../db';
import type { Storage } from '../storage';

export function assessmentCertRouter(ctx: { db: Db; storage: Storage }) {
  const r = Router();

  r.get('/api/assessments/:id/cert', requireAuth, async (req, res) => {
    const { rows } = await ctx.db.q<{ user_email: string; cert_storage_path: string | null; cert_generated_at: Date | null; score: string }>(
      `SELECT user_email, cert_storage_path, cert_generated_at, score
       FROM assessments WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ status: 'not_found' });
    const row = rows[0];

    // Ownership check — return 404 on mismatch to avoid leaking existence.
    if (!req.user!.isAdmin && row.user_email.toLowerCase() !== req.user!.email.toLowerCase()) {
      return res.status(404).json({ status: 'not_found' });
    }

    if (!row.cert_storage_path) return res.status(404).json({ status: 'pending' });

    const pdfKey = row.cert_storage_path;
    const pngKey = pdfKey.replace(/\.pdf$/, '.png');
    const [pdf, png] = await Promise.all([
      ctx.storage.presignedGet(pdfKey, 60 * 60 * 24),   // 24h
      ctx.storage.presignedGet(pngKey, 60 * 60 * 24),
    ]);
    res.json({
      status: 'ready',
      cert_pdf_url: pdf,
      cert_png_url: png,
      cert_generated_at: row.cert_generated_at,
    });
  });

  return r;
}
```

- [ ] **Step 4: Wire in `server/index.ts`**

```ts
import { assessmentCertRouter } from './routes/assessment-cert';
import { storage } from './storage';
…
app.use(assessmentCertRouter({ db, storage }));
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm run test:server -- routes-assessment-cert
```

Expected: PASS (all 3 sub-cases).

- [ ] **Step 6: Commit**

```bash
git add server/routes/assessment-cert.ts server/__tests__/routes-assessment-cert.test.ts server/index.ts
git commit -m "feat(server): /api/assessments/:id/cert with regenerated presigned URLs"
```

---

### Task 13: Remaining routes (segmented-courses, progress, transcript, send-email)

These are smaller. We port them in one task using the same patterns. Each has its own test.

**Files:**
- Create: `server/routes/segmented-courses.ts`
- Create: `server/routes/progress.ts`
- Create: `server/routes/transcript.ts`
- Create: `server/routes/send-email.ts`
- Create: `server/__tests__/routes-segmented-courses.test.ts`
- Create: `server/__tests__/routes-progress.test.ts`
- Create: `server/__tests__/routes-send-email.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Read all four sources**

```bash
cat netlify/functions/segmented-courses.ts
cat netlify/functions/progress.ts
cat netlify/functions/transcript.ts
cat netlify/functions/send-email.ts
```

Mirror their exact response shapes. They each use `clientFor(event)` and `getSession(event)` from `netlify/lib/supabase.ts` — those become `requireAuth` + `ctx.db.q`.

- [ ] **Step 2: Write failing tests for each — example for `segmented-courses`**

`server/__tests__/routes-segmented-courses.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

describe('routes/segmented-courses', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE course_segments, segmented_courses, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    const { rows } = await pool.query(
      `INSERT INTO segmented_courses (slug, title) VALUES ('tcp', 'TCP') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO course_segments (course_id, position, slug, title, intro_vimeo_id, content_vimeo_id, outro_vimeo_id)
       VALUES ($1, 1, 'tcp-1', 'Intro', 'v1', 'v2', 'v3')`,
      [rows[0].id],
    );
  });

  it('GET /api/segmented-courses lists courses (auth required)', async () => {
    const t = await signSession({ userId: '1', email: 'u@x', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/segmented-courses')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body[0].slug).toBe('tcp');
  });

  it('GET /api/segmented-courses/:slug returns course + segments', async () => {
    const t = await signSession({ userId: '1', email: 'u@x', name: null, picture: null, isAdmin: false });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/segmented-courses/tcp')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.slug).toBe('tcp');
    expect(r.body.segments).toHaveLength(1);
    expect(r.body.segments[0].slug).toBe('tcp-1');
  });
});
```

- [ ] **Step 3: Write `server/routes/segmented-courses.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware';
import type { Db } from '../db';

export function segmentedCoursesRouter(ctx: { db: Db }) {
  const r = Router();

  r.get('/api/segmented-courses', requireAuth, async (_req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT id, slug, title, description, created_at
       FROM segmented_courses ORDER BY created_at DESC`,
    );
    res.json(rows);
  });

  r.get('/api/segmented-courses/:slug', requireAuth, async (req, res) => {
    const course = await ctx.db.q(
      `SELECT id, slug, title, description FROM segmented_courses WHERE slug=$1`,
      [req.params.slug],
    );
    if (!course.rows.length) return res.status(404).end();
    const segs = await ctx.db.q(
      `SELECT id, position, slug, title, intro_vimeo_id, content_vimeo_id, outro_vimeo_id
       FROM course_segments WHERE course_id=$1 ORDER BY position ASC`,
      [course.rows[0].id],
    );
    res.json({ ...course.rows[0], segments: segs.rows });
  });

  return r;
}
```

- [ ] **Step 4: Write `server/routes/progress.ts`**

`server/__tests__/routes-progress.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

describe('routes/progress', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE course_progress, course_segments, segmented_courses, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    const c = await pool.query(`INSERT INTO segmented_courses (slug, title) VALUES ('tcp','TCP') RETURNING id`);
    await pool.query(
      `INSERT INTO course_segments (course_id, position, slug, title) VALUES ($1, 1, 'tcp-1', 'A')`,
      [c.rows[0].id],
    );
  });

  it('POST /api/progress upserts per-user-per-segment progress', async () => {
    const t = await signSession({ userId: '1', email: 'u@x', name: null, picture: null, isAdmin: false });
    const r1 = await request(buildApp({ poolOverride: pool })).post('/api/progress')
      .set('Authorization', `Bearer ${t}`)
      .send({ courseSlug: 'tcp', segmentSlug: 'tcp-1', completed: false, position_sec: 30 });
    expect(r1.status).toBe(200);

    const r2 = await request(buildApp({ poolOverride: pool })).post('/api/progress')
      .set('Authorization', `Bearer ${t}`)
      .send({ courseSlug: 'tcp', segmentSlug: 'tcp-1', completed: true, position_sec: 90 });
    expect(r2.status).toBe(200);

    const { rows } = await pool.query(`SELECT count(*)::int AS n, max(position_sec) AS p, bool_or(completed) AS c FROM course_progress`);
    expect(rows[0]).toMatchObject({ n: 1, p: 90, c: true });
  });

  it('GET /api/progress/:slug returns own progress only', async () => {
    const t = await signSession({ userId: '1', email: 'u@x', name: null, picture: null, isAdmin: false });
    await request(buildApp({ poolOverride: pool })).post('/api/progress')
      .set('Authorization', `Bearer ${t}`)
      .send({ courseSlug: 'tcp', segmentSlug: 'tcp-1', completed: true, position_sec: 60 });
    const r = await request(buildApp({ poolOverride: pool })).get('/api/progress/tcp')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].segment_slug).toBe('tcp-1');
  });
});
```

`server/routes/progress.ts`:

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware';
import type { Db } from '../db';

export function progressRouter(ctx: { db: Db }) {
  const r = Router();

  r.post('/api/progress', requireAuth, async (req, res) => {
    const { courseSlug, segmentSlug, completed, position_sec } = req.body ?? {};
    if (!courseSlug || !segmentSlug) return res.status(400).json({ error: 'courseSlug + segmentSlug required' });
    await ctx.db.q(
      `INSERT INTO course_progress (user_id, course_slug, segment_slug, completed, position_sec, updated_at)
       VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, 0), now())
       ON CONFLICT (user_id, course_slug, segment_slug) DO UPDATE
         SET completed = course_progress.completed OR EXCLUDED.completed,
             position_sec = GREATEST(course_progress.position_sec, EXCLUDED.position_sec),
             updated_at = now()`,
      [parseInt(req.user!.userId, 10), courseSlug, segmentSlug, completed, position_sec],
    );
    res.json({ ok: true });
  });

  r.get('/api/progress/:slug', requireAuth, async (req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT course_slug, segment_slug, completed, position_sec, updated_at
       FROM course_progress
       WHERE user_id = $1 AND course_slug = $2
       ORDER BY segment_slug`,
      [parseInt(req.user!.userId, 10), req.params.slug],
    );
    res.json(rows);
  });

  return r;
}
```

- [ ] **Step 5: Write `server/routes/transcript.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware';
import type { Db } from '../db';

export function transcriptRouter(ctx: { db: Db }) {
  const r = Router();

  r.get('/api/transcript/:slug', requireAuth, async (req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT slug, transcript FROM segment_transcripts WHERE slug = $1`,
      [req.params.slug],
    );
    if (!rows.length) return res.status(404).end();
    res.json(rows[0]);
  });

  return r;
}
```

(If `segment_transcripts` doesn't match the existing source's table name, adjust to match what `cat netlify/functions/transcript.ts` shows in Step 1.)

- [ ] **Step 6: Write `server/routes/send-email.ts`**

```ts
import { Router } from 'express';
import { Resend } from 'resend';
import { requireAuth, requireAdmin } from '../middleware';

export function sendEmailRouter() {
  const r = Router();

  r.post('/api/send-email', requireAuth, requireAdmin, async (req, res) => {
    const { to, subject, html, from } = req.body ?? {};
    if (!to || !subject || !html) return res.status(400).json({ error: 'to/subject/html required' });
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const result = await resend.emails.send({
      from: from ?? 'Tornix <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject, html,
    });
    if (result.error) return res.status(502).json({ error: result.error.message });
    res.json({ id: result.data?.id });
  });

  return r;
}
```

`resend` is already a project dep. No new install.

- [ ] **Step 7: Wire all four into `server/index.ts`**

```ts
import { segmentedCoursesRouter } from './routes/segmented-courses';
import { progressRouter } from './routes/progress';
import { transcriptRouter } from './routes/transcript';
import { sendEmailRouter } from './routes/send-email';
…
app.use(segmentedCoursesRouter({ db }));
app.use(progressRouter({ db }));
app.use(transcriptRouter({ db }));
app.use(sendEmailRouter());
```

- [ ] **Step 8: Run all route tests, verify pass**

```bash
npm run test:server -- routes-
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add server/routes/segmented-courses.ts server/routes/progress.ts server/routes/transcript.ts server/routes/send-email.ts server/__tests__/routes-segmented-courses.test.ts server/__tests__/routes-progress.test.ts server/index.ts
git commit -m "feat(server): port segmented-courses, progress, transcript, send-email routes"
```

---

### Task 14: Port renderer (shared/branding.ts, shared/cert-template.ts) + worker

**Files:**
- Create: `shared/branding.ts`
- Create: `shared/cert-template.ts`
- Create: `worker/render.ts`
- Create: `worker/index.ts`
- Create: `worker/__tests__/polling.test.ts`
- Create: `worker/__tests__/render.smoke.test.ts`

- [ ] **Step 1: Copy the existing renderer files and adapt to pg**

```bash
mkdir -p shared
cp netlify/functions/certificate-renderer/template.ts shared/cert-template.ts
cp netlify/functions/certificate-renderer/branding.ts shared/branding.ts
```

Edit `shared/branding.ts`: replace the function signature `fetchBrandingForServer(sb: SupabaseClient)` with `fetchBrandingForServer(db: Db)`, replace `sb.from('settings').select('*').eq('key','branding').single()` with `db.q(...)`. Replace the `sb.storage` bytea fetch with reading the `logo_bytes`, `badge_bytes`, `cert_bg_bytes` columns directly (they're now in the same row as `data`).

Example diff sketch (full code depends on what's currently in `branding.ts`):

```ts
import type { Db } from '../server/db';

export async function fetchBrandingForServer(db: Db) {
  const { rows } = await db.q(`SELECT * FROM settings WHERE key='branding'`);
  const row = rows[0] ?? {};
  return {
    data: row.data ?? {},
    logoDataUrl: row.logo_bytes
      ? `data:${row.logo_mime ?? 'image/png'};base64,${Buffer.from(row.logo_bytes).toString('base64')}`
      : null,
    badgeDataUrl: row.badge_bytes
      ? `data:${row.badge_mime ?? 'image/png'};base64,${Buffer.from(row.badge_bytes).toString('base64')}`
      : null,
    certBgDataUrl: row.cert_bg_bytes
      ? `data:${row.cert_bg_mime ?? 'image/jpeg'};base64,${Buffer.from(row.cert_bg_bytes).toString('base64')}`
      : null,
  };
}
```

Read the actual existing `netlify/functions/certificate-renderer/branding.ts` first to preserve its return shape exactly — `cert-template.ts` consumes it and must keep working.

`shared/cert-template.ts` stays unchanged from the original (it's pure HTML generation).

- [ ] **Step 2: Write `worker/render.ts`**

```ts
import puppeteer from 'puppeteer-core';
import type { Db } from '../server/db';
import type { Storage } from '../server/storage';
import { fetchBrandingForServer } from '../shared/branding';
import { renderCertHtml } from '../shared/cert-template';

export interface RenderCtx {
  db: Db;
  storage: Storage;
  chromiumPath: string;
}

export async function renderAndUpload(ctx: RenderCtx, assessmentId: number): Promise<void> {
  const { rows } = await ctx.db.q<{
    id: number; user_name: string | null; user_email: string;
    user_photo: string | null; score: string; serial_number: string | null;
    created_at: Date;
  }>(
    `SELECT id, user_name, user_email, user_photo, score, serial_number, created_at
     FROM assessments WHERE id = $1`,
    [assessmentId],
  );
  if (!rows.length) throw new Error(`assessment ${assessmentId} not found`);
  const row = rows[0];
  if (Number(row.score) < 60) throw new Error(`assessment ${assessmentId} score ${row.score} < 60`);

  const branding = await fetchBrandingForServer(ctx.db);
  const html = renderCertHtml({
    ...branding,
    userName: row.user_name || 'Student',
    userEmail: row.user_email,
    userPhoto: row.user_photo,
    score: Math.round(Number(row.score)),
    serialNumber: row.serial_number || `TCP-${row.id}`,
    createdAt: row.created_at,
  });

  const browser = await puppeteer.launch({
    executablePath: ctx.chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 2480, height: 3508, deviceScaleFactor: 1 },
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'user-agent': 'Tornix-Cert-Renderer/1.0' });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });
    await page.evaluate(() => (document as any).fonts.ready);
    await new Promise(r => setTimeout(r, 300));

    const pdf = Buffer.from(await page.pdf({
      width: '2480px', height: '3508px', printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: false,
    }));
    const png = Buffer.from(await page.screenshot({
      type: 'png', clip: { x: 0, y: 0, width: 2480, height: 3508 },
    }) as Uint8Array);

    const safeEmail = row.user_email.toLowerCase();
    const pdfKey = `${safeEmail}/${assessmentId}.pdf`;
    const pngKey = `${safeEmail}/${assessmentId}.png`;
    await ctx.storage.put(pdfKey, pdf, 'application/pdf');
    await ctx.storage.put(pngKey, png, 'image/png');

    await ctx.db.q(
      `UPDATE assessments
       SET cert_storage_path = $2, cert_generated_at = now(),
           cert_pdf_url = NULL, cert_png_url = NULL
       WHERE id = $1`,
      [assessmentId, pdfKey],
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
```

- [ ] **Step 3: Write `worker/index.ts` (polling loop)**

```ts
import { db } from '../server/db';
import { storage } from '../server/storage';
import { renderAndUpload } from './render';
import { env } from '../server/env';

const MAX_ATTEMPTS = 3;
const IDLE_SLEEP_MS = 3000;

async function pollOnce(): Promise<boolean> {
  const claimed = await db.tx(async (c) => {
    const { rows } = await c.query(
      `SELECT id, assessment_id FROM cert_jobs
       WHERE status='pending' AND attempts < $1
       ORDER BY created_at ASC LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS],
    );
    if (!rows.length) return null;
    await c.query(
      `UPDATE cert_jobs SET status='running', attempts=attempts+1, updated_at=now() WHERE id=$1`,
      [rows[0].id],
    );
    return rows[0] as { id: number; assessment_id: number };
  });
  if (!claimed) return false;

  try {
    await renderAndUpload({ db, storage, chromiumPath: env.CHROMIUM_PATH }, claimed.assessment_id);
    await db.q(`UPDATE cert_jobs SET status='done', updated_at=now() WHERE id=$1`, [claimed.id]);
    console.log('[worker] done', claimed);
  } catch (e: any) {
    const errMsg = String(e?.message ?? e);
    const { rows } = await db.q<{ attempts: number }>(
      `SELECT attempts FROM cert_jobs WHERE id=$1`, [claimed.id],
    );
    const final = (rows[0]?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
    await db.q(
      `UPDATE cert_jobs SET status=$2, last_error=$3, updated_at=now() WHERE id=$1`,
      [claimed.id, final ? 'failed' : 'pending', errMsg],
    );
    console.error('[worker] error', claimed, errMsg);
  }
  return true;
}

async function main() {
  console.log('[worker] starting');
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  while (true) {
    const did = await pollOnce();
    if (!did) await new Promise(r => setTimeout(r, IDLE_SLEEP_MS));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('[worker] fatal', e); process.exit(1); });
}
```

- [ ] **Step 4: Write `worker/__tests__/polling.test.ts` (mocks the render to test the loop only)**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { makeDb } from '../../server/db';

// We test pollOnce with renderAndUpload mocked to a controllable promise.
// Import-time mock the render module before importing the worker.
vi.mock('../render', () => ({
  renderAndUpload: vi.fn(),
}));

import { renderAndUpload } from '../render';

// Re-implement pollOnce against an injected pool for the test (mirrors worker/index.ts)
async function pollOnce(pool: Pool, mockRender: any) {
  const db = makeDb(() => pool);
  const claimed = await db.tx(async (c) => {
    const { rows } = await c.query(
      `SELECT id, assessment_id FROM cert_jobs WHERE status='pending' AND attempts < 3
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!rows.length) return null;
    await c.query(`UPDATE cert_jobs SET status='running', attempts=attempts+1, updated_at=now() WHERE id=$1`, [rows[0].id]);
    return rows[0];
  });
  if (!claimed) return false;
  try {
    await mockRender(claimed.assessment_id);
    await db.q(`UPDATE cert_jobs SET status='done' WHERE id=$1`, [claimed.id]);
  } catch (e: any) {
    const final = (await db.q(`SELECT attempts FROM cert_jobs WHERE id=$1`, [claimed.id])).rows[0].attempts >= 3;
    await db.q(`UPDATE cert_jobs SET status=$2, last_error=$3 WHERE id=$1`,
               [claimed.id, final ? 'failed' : 'pending', String(e?.message)]);
  }
  return true;
}

describe('worker polling', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (5, 1, 'u@x', 80, 'Passed', '[]'::jsonb)`);
  });

  it('claims and marks a job done on success', async () => {
    await pool.query(`INSERT INTO cert_jobs (assessment_id) VALUES (5)`);
    const ok = await pollOnce(pool, vi.fn().mockResolvedValue(undefined));
    expect(ok).toBe(true);
    const { rows } = await pool.query(`SELECT status, attempts FROM cert_jobs`);
    expect(rows[0]).toEqual({ status: 'done', attempts: 1 });
  });

  it('marks job pending again after first failure', async () => {
    await pool.query(`INSERT INTO cert_jobs (assessment_id) VALUES (5)`);
    await pollOnce(pool, vi.fn().mockRejectedValue(new Error('boom')));
    const { rows } = await pool.query(`SELECT status, attempts, last_error FROM cert_jobs`);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].last_error).toBe('boom');
  });

  it('marks job failed after MAX_ATTEMPTS', async () => {
    await pool.query(`INSERT INTO cert_jobs (assessment_id, attempts) VALUES (5, 2)`);
    await pollOnce(pool, vi.fn().mockRejectedValue(new Error('final')));
    const { rows } = await pool.query(`SELECT status FROM cert_jobs`);
    expect(rows[0].status).toBe('failed');
  });

  it('returns false when queue is empty', async () => {
    expect(await pollOnce(pool, vi.fn())).toBe(false);
  });
});
```

- [ ] **Step 5: Run the polling test, verify it passes**

```bash
npm run test:server -- polling
```

Expected: all 4 sub-cases PASS.

- [ ] **Step 6: Write a smoke test for the actual render**

`worker/__tests__/render.smoke.test.ts` — gated on Chromium availability:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { renderAndUpload } from '../render';
import { makeDb } from '../../server/db';
import { storage } from '../../server/storage';

const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const skip = !existsSync(CHROMIUM);

describe.skipIf(skip)('renderAndUpload smoke', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE assessments, settings, users RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    await pool.query(`INSERT INTO settings (key, data) VALUES ('branding', '{}'::jsonb)`);
    await pool.query(`INSERT INTO assessments (id, user_id, user_email, user_name, score, status, answers)
                      VALUES (99, 1, 'u@x', 'Smoke User', 85, 'Passed', '[]'::jsonb)`);
  });

  it('renders a non-empty PDF and uploads it to MinIO', async () => {
    await renderAndUpload(
      { db: makeDb(() => pool), storage, chromiumPath: CHROMIUM },
      99,
    );
    const { rows } = await pool.query(`SELECT cert_storage_path FROM assessments WHERE id=99`);
    expect(rows[0].cert_storage_path).toBe('u@x/99.pdf');

    const url = await storage.presignedGet('u@x/99.pdf', 30);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(5_000);   // a real PDF is > 5KB
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  }, 60_000);
});
```

Install Chromium locally before running:

```bash
sudo apt install -y chromium-browser
```

- [ ] **Step 7: Run smoke test (will SKIP if no Chromium, else PASS)**

```bash
npm run test:server -- render.smoke
```

Expected: SKIP if Chromium missing; PASS if installed.

- [ ] **Step 8: Commit**

```bash
git add shared/ worker/ server/__tests__/  # all new shared/, worker/ files
git commit -m "feat(worker): port cert renderer to system chromium + DB-backed job queue"
```

---

### Task 15: Frontend — `useSession.ts` rewrite

**Files:**
- Modify: `src/useSession.ts`
- Modify: `src/test/setup.ts` (if needed for the new test)
- Create: `src/useSession.test.ts`

- [ ] **Step 1: Read the existing `src/useSession.ts` to preserve its public API**

```bash
cat src/useSession.ts
```

Identify the exports the rest of the app uses (search with `grep -r "useSession" src/`). Match their shape.

- [ ] **Step 2: Write failing test `src/useSession.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from './useSession';

function makeJwt(claims: object) {
  // unsigned JWT — client never verifies, only decodes
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.`;
}

describe('useSession', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('returns null user when no token stored', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.user).toBeNull();
  });

  it('parses #token=… on mount, stores it, cleans URL', () => {
    const t = makeJwt({ sub: '1', email: 'k@example.com', name: 'K', is_admin: false });
    history.replaceState(null, '', `/dashboard#token=${t}`);
    const { result } = renderHook(() => useSession());
    expect(result.current.user?.email).toBe('k@example.com');
    expect(localStorage.getItem('tornix.jwt')).toBe(t);
    expect(location.hash).toBe('');
  });

  it('clears state on signOut()', () => {
    localStorage.setItem('tornix.jwt', makeJwt({ sub: '1', email: 'k@example.com' }));
    const { result } = renderHook(() => useSession());
    expect(result.current.user).not.toBeNull();
    act(() => result.current.signOut());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('tornix.jwt')).toBeNull();
  });

  it('ignores expired tokens', () => {
    const expired = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ exp: 1, email: 'old@x' })).toString('base64url')}.`;
    localStorage.setItem('tornix.jwt', expired);
    const { result } = renderHook(() => useSession());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('tornix.jwt')).toBeNull();
  });
});
```

If `@testing-library/react` isn't already installed:

```bash
npm install -D @testing-library/react
```

- [ ] **Step 3: Run test, verify it fails**

```bash
npm test -- useSession
```

Expected: FAIL.

- [ ] **Step 4: Rewrite `src/useSession.ts`**

```ts
import { useEffect, useState, useCallback } from 'react';

const KEY = 'tornix.jwt';

export interface Session {
  userId: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  exp: number;
}

function decode(token: string): Session | null {
  try {
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return {
      userId: String(payload.sub),
      email: String(payload.email),
      name: payload.name ?? null,
      picture: payload.picture ?? null,
      isAdmin: !!payload.is_admin,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function load(): Session | null {
  const t = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (!t) return null;
  const s = decode(t);
  if (!s) { localStorage.removeItem(KEY); return null; }
  return s;
}

export function useSession() {
  const [user, setUser] = useState<Session | null>(load);

  useEffect(() => {
    if (location.hash.startsWith('#token=')) {
      const t = location.hash.slice(7);
      localStorage.setItem(KEY, t);
      history.replaceState(null, '', location.pathname + location.search);
      const s = decode(t);
      if (s) setUser(s);
      else localStorage.removeItem(KEY);
    }
  }, []);

  const signIn = useCallback((next: string = location.pathname) => {
    location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY);
    setUser(null);
  }, []);

  return { user, signIn, signOut };
}

export function getStoredToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
}
```

Note: the browser doesn't have `Buffer` natively. If the project already polyfills it (Vite often does via `vite-plugin-node-polyfills`), fine. If not, swap to `atob`:

```ts
const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
```

Check by running `grep -r "buffer" vite.config.ts package.json`.

- [ ] **Step 5: Run test, verify it passes**

```bash
npm test -- useSession
```

Expected: PASS (4 sub-cases).

- [ ] **Step 6: Commit**

```bash
git add src/useSession.ts src/useSession.test.ts package.json package-lock.json
git commit -m "feat(client): rewrite useSession to use localStorage JWT (no supabase)"
```

---

### Task 16: Frontend — `api.ts` swap auth header

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Read existing `src/api.ts`**

```bash
cat src/api.ts
```

Find every place it pulls auth from Supabase (likely `supabase.auth.getSession()` or a header builder). Replace with `getStoredToken()` from `useSession.ts`.

- [ ] **Step 2: Edit `src/api.ts`**

Replace the auth-header builder. Approximate before/after:

```ts
// BEFORE
import { supabase } from './supabase';
async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
```

```ts
// AFTER
import { getStoredToken } from './useSession';
function authHeader(): Record<string, string> {
  const t = getStoredToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
```

Update every callsite that `await`ed `authHeader()` — it's synchronous now. The fetch wrapper that uses it stays the same shape.

If `api.ts` also imports anything else from `./supabase` (e.g., a public storage URL builder), replace it with a static path: `/api/assessments/${id}/cert` already returns presigned URLs, so the client just reads the response, no Supabase storage helper needed.

- [ ] **Step 3: Type-check and lint**

```bash
npm run lint
```

Expected: zero `tsc` errors.

- [ ] **Step 4: Commit**

```bash
git add src/api.ts
git commit -m "feat(client): api.ts uses localStorage JWT, drops supabase"
```

---

### Task 17: Frontend — `App.tsx` cleanup (no per-component changes needed)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Search for any direct `supabase` imports outside `api.ts` / `useSession.ts`**

```bash
grep -rn "from './supabase'\|from '@/supabase'\|supabase\.auth\|supabase\.storage" src/ --include='*.tsx' --include='*.ts'
```

Expected: only `api.ts` (already updated) and `useSession.ts` (already replaced) — if anything else shows up, fix it now using the same patterns.

- [ ] **Step 2: Verify `App.tsx` doesn't render anything Supabase-specific**

The OAuth callback handoff lives entirely inside `useSession`'s `useEffect`. `App.tsx` shouldn't need changes. But run the dev server to confirm:

```bash
docker compose -f docker-compose.dev.yml up -d
npm run server:dev &
sleep 2
npm run dev &
sleep 3
```

Open `http://localhost:5173` in your browser. Expected:
- App renders without console errors.
- Clicking "Sign in" redirects through Google.
- After consent, the URL has `#token=...` and the app shows you signed in.
- Reload — still signed in.

Kill both processes when done.

- [ ] **Step 3: If anything renders wrong, fix in `App.tsx` and commit**

If nothing needed changing, skip the commit and move to Task 18.

---

### Task 18: Delete `src/supabase.ts`, `netlify/`, and `netlify.toml`

**Files:**
- Delete: `src/supabase.ts`
- Delete: `netlify/` directory
- Delete: `netlify.toml`
- Modify: `package.json` (remove deps)

- [ ] **Step 1: Verify nothing else imports `./supabase`**

```bash
grep -rn "from.*['\"].*supabase['\"]" src/ --include='*.tsx' --include='*.ts'
```

Expected: zero matches.

- [ ] **Step 2: Delete files**

```bash
rm src/supabase.ts
rm -rf netlify/
rm netlify.toml
rm -rf .netlify/   # local netlify-dev state
```

- [ ] **Step 3: Remove deps from `package.json`**

Run:

```bash
npm uninstall @supabase/supabase-js @sparticuz/chromium-min @netlify/functions firebase-admin html2canvas jspdf ws
```

(Some of these may already be unused; the command is idempotent and the user has the actual list to verify against.)

- [ ] **Step 4: Type-check passes**

```bash
npm run lint
```

Expected: zero `tsc` errors.

- [ ] **Step 5: Run all tests**

```bash
npm test -- --run
npm run test:server
```

Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add -u   # picks up deletions
git add package.json package-lock.json
git commit -m "chore: remove supabase, netlify, sparticuz/chromium-min, jspdf, html2canvas"
```

---

### Task 19: `package.json` — dev/build/prod scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Rewrite the `scripts` block**

```json
"scripts": {
  "dev": "concurrently -k -n web,api,worker -c blue,green,yellow \"npm:dev:web\" \"npm:server:dev\" \"npm:worker:dev\"",
  "dev:web": "vite",
  "server:dev": "tsx --watch --env-file=.env.local server/index.ts",
  "worker:dev": "tsx --watch --env-file=.env.local worker/index.ts",

  "build": "vite build",
  "build:server": "tsc -p tsconfig.server.json",
  "build:all": "npm run build && npm run build:server",

  "start:server": "node --enable-source-maps server-dist/server/index.js",
  "start:worker": "node --enable-source-maps server-dist/worker/index.js",

  "lint": "tsc --noEmit && tsc --noEmit -p tsconfig.server.json",
  "test": "vitest",
  "test:run": "vitest run",
  "test:server": "vitest run --config vitest.server.config.ts",

  "db:reset:dev": "psql \"$DATABASE_URL\" -f db/schema.sql -f db/migrations/001_segmented_courses.sql -f db/migrations/002_cert_columns.sql -f db/migrations/003_cert_jobs.sql -f db/migrations/004_oauth_state_payload.sql",
  "backfill:certs": "tsx --env-file=.env.local scripts/backfill-certs.ts",
  "seed:tcp": "tsx --env-file=.env.local scripts/seed-tcp.ts",
  "upload:vimeo": "tsx --env-file=.env.local scripts/upload-vimeo.ts"
}
```

Install the new dev-only tool:

```bash
npm install -D concurrently
```

- [ ] **Step 2: Verify `npm run dev` brings everything up**

```bash
docker compose -f docker-compose.dev.yml up -d
npm run dev
```

Expected: three labeled streams (web, api, worker), all start cleanly. Vite at :5173, API at :3000, worker logs "[worker] starting".

Kill with Ctrl-C.

- [ ] **Step 3: Verify production build works**

```bash
npm run build:all
ls dist/ server-dist/server server-dist/worker
NODE_ENV=production node --env-file=.env.local --enable-source-maps server-dist/server/index.js &
SERVER_PID=$!
sleep 2
curl -fsS http://localhost:3000/api/health
kill $SERVER_PID
```

Expected: health returns `{ ok: true, db: 'up' }`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: dev/build/test scripts for self-hosted stack"
```

---

### Task 20: Update existing migration script `scripts/backfill-certs.ts` to the new model

**Files:**
- Modify: `scripts/backfill-certs.ts`

The existing script triggers the Netlify background function via shared secret. The new model inserts `cert_jobs` rows; the worker picks them up.

- [ ] **Step 1: Read existing script**

```bash
cat scripts/backfill-certs.ts
```

- [ ] **Step 2: Rewrite as a simple enqueue script**

```ts
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query(`
    SELECT a.id FROM assessments a
    WHERE a.score >= 60 AND a.cert_storage_path IS NULL
    ORDER BY a.id
  `);
  console.log(`backfill: ${rows.length} assessments need certs`);

  for (const { id } of rows) {
    await pool.query(
      `INSERT INTO cert_jobs (assessment_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM cert_jobs WHERE assessment_id=$1 AND status IN ('pending','running')
       )`,
      [id],
    );
    console.log(`enqueued cert_job for assessment ${id}`);
  }
  await pool.end();
  console.log('backfill done. worker will render in the background.');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify it runs (zero work on a fresh dev DB)**

```bash
npm run backfill:certs
```

Expected: `backfill: 0 assessments need certs`.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-certs.ts
git commit -m "chore(scripts): backfill:certs enqueues cert_jobs (no shared-secret HTTP)"
```

---

### Task 21: End-to-end local smoke test

**Files:** none new — this validates everything previous.

- [ ] **Step 1: Start the full stack**

```bash
docker compose -f docker-compose.dev.yml up -d
npm run dev
```

Wait until vite + api + worker are all running.

- [ ] **Step 2: In a new terminal, run a complete user journey**

```bash
# 1. health
curl -fsS http://localhost:3000/api/health | jq

# 2. Public branding endpoint
curl -fsS http://localhost:3000/api/settings/branding | jq

# 3. Browser-driven OAuth (manual): visit http://localhost:5173, click Sign In,
#    complete Google flow, land back signed in. After this step the JWT is in
#    localStorage and you can copy it from DevTools.

# 4. Save the JWT from devtools
JWT=<paste>

# 5. Auth-only endpoint
curl -fsS http://localhost:3000/api/me -H "Authorization: Bearer $JWT" | jq

# 6. Make yourself admin
PGPASSWORD=tornix_dev psql -h localhost -p 5433 -U tornix tornix_accreditation \
  -c "UPDATE users SET is_admin=true WHERE email='your@email'"

# 7. Re-sign-in to get a fresh JWT carrying is_admin=true (re-do step 3), then:
curl -fsS http://localhost:3000/api/courses -H "Authorization: Bearer $JWT" | jq

# 8. Take an assessment (simulate the SPA's POST)
curl -fsS -X POST http://localhost:3000/api/assessments \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"score":85,"integrity_score":95,"status":"Passed","answers":[],"questions_count":20,"user_name":"Smoke User"}' | jq

# 9. Poll for cert (should flip from 'pending' to 'ready' within ~20s if Chromium is installed)
ASSESSMENT_ID=<from step 8>
for i in 1 2 3 4 5 6 7 8 9 10; do
  R=$(curl -fsS http://localhost:3000/api/assessments/$ASSESSMENT_ID/cert -H "Authorization: Bearer $JWT")
  echo "$R"
  [[ "$R" == *'"status":"ready"'* ]] && break
  sleep 3
done

# 10. Open the presigned PDF URL from the response — should download a real PDF.
```

- [ ] **Step 3: Run the full server test suite once more**

```bash
npm run test:server
npm run test:run
```

Expected: all green.

- [ ] **Step 4: Final commit (only if anything changed)**

```bash
git status
# if clean, no commit needed
```

---

## Self-review checklist (run after writing the plan)

- [ ] Every spec section has a corresponding task: architecture, code restructure, auth, storage, cert pipeline, deps, frontend changes. ✓ (Tasks 1–21)
- [ ] No `TBD` / `TODO` / "implement later" tokens remain.
- [ ] Every step has either concrete code or a concrete command.
- [ ] Method names are consistent across tasks: `signSession`/`verifySession`, `enqueueCertJob`, `renderAndUpload`, `storage.put`, `storage.presignedGet`, `db.q`, `db.tx`, `getStoredToken`.
- [ ] Each task ends with a commit.

## Out of scope (handled in Plans 2 & 3)

- Provisioning the actual EC2 instance, installing Postgres / MinIO / Chromium / Caddy via apt, writing systemd unit files, Caddyfile, security groups.
- Production data migration: `pg_dump` from Supabase, restore to EC2, copy cert bucket, sequence resets, admin bootstrap.
- DNS swap, maintenance-mode banner on Netlify, LE cert issuance, cutover smoke test.
