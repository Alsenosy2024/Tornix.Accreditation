# Tornix Accreditation

A bilingual accreditation platform for professional assessment, segmented training, and certificate issuance.

[Live application](https://tornix-test.ailigent.ai)

## What it includes

- Arabic and English assessment flows with integrity controls
- Google sign-in and JWT-backed sessions
- Segmented Vimeo training with progress tracking
- Server-rendered PDF and PNG certificates
- Admin-managed branding and course content
- Accessible light and dark themes with radial transitions

## Architecture

| Layer | Technology |
| --- | --- |
| Web | React 19, Vite, TypeScript, Tailwind CSS |
| API | Express 5 |
| Database | PostgreSQL 16 |
| Object storage | MinIO through an S3-compatible client |
| Certificate worker | Node.js, Puppeteer, system Chromium |
| Production edge | Caddy on AWS EC2 |

## Local development

### Prerequisites

- Node.js 22+
- npm
- Docker with Docker Compose
- PostgreSQL client tools (`psql`) for server integration tests

### Setup

1. Clone the repository and install locked dependencies:

   ```bash
   git clone https://github.com/Alsenosy2024/Tornix.Accreditation.git
   cd Tornix.Accreditation
   npm ci
   ```

2. Start local PostgreSQL and MinIO:

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

3. Copy the environment template and provide local credentials:

   ```bash
   cp .env.example .env.local
   ```

4. Initialize the development database:

   ```bash
   npm run db:reset:dev
   ```

5. Start the frontend, API, and certificate worker:

   ```bash
   npm run dev
   ```

The Vite application and Express API URLs are printed in the terminal.

## Environment

`.env.local` is required and must never be committed. It configures:

- Public base URL and API port
- PostgreSQL development and test connections
- Google OAuth and JWT signing
- MinIO/S3-compatible storage
- Gemini, Resend, and Vimeo integrations
- System Chromium for certificate rendering

Use `.env.example` as the source of variable names. Keep all real credentials outside Git.

## Verification

```bash
npm run test:run       # client and shared unit tests
npm run test:server    # API and certificate-worker integration tests
npm run lint           # client and server TypeScript checks
npm run build:all      # frontend and server production builds
```

Server tests recreate the configured test database and require PostgreSQL and MinIO.

## Project layout

```text
src/                  React application
server/               Express API and server integration tests
worker/               Certificate rendering worker
shared/               Shared certificate branding and template code
db/                   PostgreSQL schema and migrations
deploy/               Caddy and systemd production definitions
scripts/              Operational and maintenance scripts
public/               Static frontend assets
```

## Contribution workflow

1. Branch from `main`.
2. Make a focused change with tests.
3. Run the relevant tests, `npm run lint`, and `npm run build:all`.
4. Push the branch and open a pull request for review.

Do not commit `.env.local`, generated `dist/` or `server-dist/` output, or credentials.

## Production

Production runs on AWS EC2 behind Caddy, with the API and certificate worker managed by systemd. Deployment is manual. Authorized maintainers should follow [`CLAUDE.md`](CLAUDE.md) for the current deployment and health-check procedure.

## License

This repository is maintained by Ailigent. No public license has been granted.
