# DevDocs AI

DevDocs AI is a pre-build planning application. It guides a developer through
project discovery and a project-type-specific set of planning domains, then
produces editable Markdown documentation for export to a codebase or coding
agent.

The repository is a pnpm/Turborepo monorepo:

```text
apps/
  web/       Next.js 14 App Router frontend
  api/       Hono API, tRPC routers, AI SSE stream, and Drizzle schema
packages/
  shared/    Shared TypeScript types, Zod schemas, and prompt construction
```

## Architecture

- Clerk owns authentication. The API maps Clerk user IDs to local PostgreSQL
  UUIDs.
- CRUD operations use authenticated tRPC procedures under `/trpc`.
- AI generation uses `POST /ai/stream` because it returns server-sent events.
- Interview navigation and conversation state live in a Zustand store.
- Interview snapshots live in `projects.interview_data`.
- Generated and manually edited document bodies live canonically in
  `documentation_bundles`.
- User-supplied provider keys are verified server-side and encrypted at rest
  with AES-256-GCM. Plaintext keys are never returned to the browser.

Supported AI providers are Anthropic, OpenAI, Meta Muse, and server-configured
Amazon Bedrock. The active provider preference is stored in the browser; key
material is not.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- PostgreSQL
- A Clerk application
- At least one supported provider key, unless Bedrock is configured server-side
- Upstash Redis is optional; rate limiting and response caching degrade safely
  when it is not configured

## Local setup

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Fill in the required values in both files. At minimum, configure:

- `DATABASE_URL`
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_URL`
- `WEB_URL`
- `ENCRYPTION_KEY`

`ENCRYPTION_KEY` must be 64 hexadecimal characters (32 bytes):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Apply committed migrations before starting the applications:

```bash
pnpm --filter @devdocs/api db:migrate
pnpm dev
```

The default development URLs are:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## Common commands

```bash
pnpm dev                                  # run web and API
pnpm build                                # production-build all packages
pnpm typecheck                            # TypeScript across the monorepo
pnpm lint                                 # frontend ESLint
pnpm test                                 # API integration tests
pnpm --filter @devdocs/api db:migrate     # apply committed migrations
pnpm --filter @devdocs/web test:e2e       # deterministic mocked browser suite
pnpm --filter @devdocs/web test:e2e:hitl  # real deployed/HITL browser suite
```

## Database migrations and tests

The Drizzle schema is in `apps/api/src/schema.ts`, with committed migrations in
`apps/api/drizzle/`.

For a schema change:

1. Update `src/schema.ts`.
2. Generate a migration with Drizzle Kit.
3. Review and commit the SQL and metadata.
4. Apply it with `pnpm --filter @devdocs/api db:migrate`.

API tests require `TEST_DATABASE_URL` (or `DATABASE_URL`) to point to a database
whose name contains `_test`. The test setup refuses any other database name,
runs migrations, and truncates test data before and after the suite.

## API surface

Public operational endpoints:

```text
GET  /health         service metadata and uptime
GET  /health/live    process liveness
GET  /health/ready   PostgreSQL readiness
GET  /metrics        Prometheus text metrics
```

Application endpoints:

```text
ALL  /trpc/*             projects, documents, keys, sessions, and account data
POST /ai/stream          authenticated AI SSE stream
GET  /ai/bedrock-status  Bedrock availability metadata
```

Legacy REST CRUD routes for projects, keys, and sessions have been removed.

## Testing and CI

`.github/workflows/ci.yml` runs typechecking, linting, PostgreSQL-backed API
tests, deterministic Playwright tests, and production builds. Configure the
`CLERK_PUBLISHABLE_KEY` repository secret for the browser job.

The deterministic Playwright suite mocks first-party application traffic and
runs with one worker. The richer deployed suite is manual because it exercises
real Clerk/provider state. It requires:

- repository variable `BASE_URL`
- secret `E2E_STORAGE_STATE_BASE64`
- secret `CLERK_PUBLISHABLE_KEY`

See [`apps/web/e2e/README.md`](apps/web/e2e/README.md) for its contracts,
artifacts, HITL hooks, and local workflow.

## Deployment

The web app can be deployed to Vercel or another Next.js host. The API can run
on Railway, Fly.io, or any Node.js host:

```bash
pnpm --filter @devdocs/api build
pnpm --filter @devdocs/api start
```

Run database migrations as a release step before directing traffic to a new API
version. Configure `/health/live` and `/health/ready` separately in the hosting
platform, and scrape `/metrics` if a Prometheus-compatible collector is used.

Operational configuration includes `SENTRY_DSN`, `APP_VERSION`, and `LOG_LEVEL`.
Redis and Bedrock variables are documented in `apps/api/.env.example`.

## Further documentation

- [`CLAUDE.md`](CLAUDE.md) — codebase conventions and implementation invariants
- [`apps/web/e2e/README.md`](apps/web/e2e/README.md) — browser-test framework
- [`docs/CLERK_SETUP.md`](docs/CLERK_SETUP.md) — Clerk setup background
- [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md) — deployment background

Some files under `docs/` are historical implementation plans. The source code,
this README, and `CLAUDE.md` describe the current architecture.
