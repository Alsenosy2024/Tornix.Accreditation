# Firebase → Supabase migration

Live site: https://tornix-accreditation-1778445249.netlify.app
Supabase project: https://xhpdyanfxiuuokygujfj.supabase.co

## Architecture

| Was                                                                  | Now                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Firestore: `settings/branding` (+ chunked docs)                      | Postgres `settings` (1 row, image blobs in `bytea`, JSONB for the rest)        |
| Firestore: `users/{uid}/assessments/{id}`                            | Postgres `assessments`, FK to `users.id` (UUID matching `auth.users.id`)       |
| Firestore: `courses`                                                 | Postgres `courses`                                                             |
| Firestore: `admins/{uid}` + hard-coded admin emails in rules         | Email allowlist in RLS policies + `users.is_admin` flag                        |
| Firebase Auth                                                        | Supabase Auth (Google provider) — access token verified by Netlify Functions   |
| Firebase Storage (branding images + course videos)                   | Branding: `bytea` in Postgres. Course videos: external URL only.               |

All data access goes through Netlify Functions that use the Supabase JS
client scoped to the caller's JWT. **Row-Level Security is the security
model** — every policy lives in the database.

## What's already deployed

- ✅ Postgres schema applied to Supabase (4 tables, RLS enabled)
- ✅ Netlify Functions (`me`, `settings-branding`, `courses`, `assessments`, `send-email`) live
- ✅ Frontend rewritten to use Supabase Auth via `@supabase/supabase-js`
- ✅ Env vars set on Netlify: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`,
   `RESEND_API_KEY`, `NODE_VERSION=22`

## What you still need to do

### 1. Enable Google sign-in in Supabase

In the Supabase dashboard:

- **Authentication → URL Configuration**
  - Site URL: `https://tornix-accreditation-1778445249.netlify.app`
  - Redirect URLs (add both):
    - `https://tornix-accreditation-1778445249.netlify.app`
    - `http://localhost:8888` (only if you want `netlify dev`)

- **Authentication → Providers → Google**
  - Toggle **Enabled**.
  - You'll need a Google OAuth 2.0 client. Create one at
    https://console.cloud.google.com/apis/credentials
    - Application type: **Web application**
    - Authorized redirect URI:
      `https://xhpdyanfxiuuokygujfj.supabase.co/auth/v1/callback`
  - Paste the Google **Client ID** and **Client Secret** into the Supabase Google
    provider page.

### 2. Pull the existing data from Firestore

```bash
# Drop your Firebase service-account key into the project root (gitignored)
ls serviceAccountKey.json

# Pull every collection plus the Firebase Auth user list
npm run db:export-firestore
```

That writes `firebase-export/` with five JSON files.

### 3. Get the Supabase Postgres URL

Supabase dashboard → **Settings → Database → Connection string → Transaction pooler**.

Copy the URL (looks like `postgresql://postgres.xhpdy...:PASS@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`)
and run the import:

```bash
DATABASE_URL='postgresql://postgres.xhpdy...:PASS@.../postgres' npm run db:import-postgres
```

The script is idempotent — re-running is safe. Legacy users that
haven't yet signed in via Supabase land in `public.users` as orphan rows
(no `auth.users` link). When that email next signs in with Google,
the `handle_new_user` trigger links the existing row by email.

### 4. Smoke-test

- Open the live site, click **Continue with Google**, sign in.
- Hit `Ctrl+Shift+A` (or whatever the admin hotkey is) and open the admin
  dashboard. Confirm imported assessments show up.

### 5. After cutover

- Rotate the keys you pasted in chat (Gemini, Resend).
- Delete the Firebase service-account key once the import is verified.
- Old data stays in Firestore as a backup; the new app never reads from it.
