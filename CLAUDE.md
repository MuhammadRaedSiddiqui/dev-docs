# CLAUDE.md — DevDocs AI

This is the working guide for coding agents in this repository. Keep it aligned
with the source code whenever architecture, workflows, or invariants change.

## Product

DevDocs AI runs a structured planning interview and creates editable Markdown
documentation for a developer's project. Ten domains are supported, but each
project type uses only its relevant domain set. The output can be downloaded as
merged Markdown or a ZIP bundle.

The currently available product is a free bring-your-own-key workspace. Paid,
hosted-key, PDF, versioning, and team features are roadmap ideas, not implemented
plans. Do not present invented quotas, prices, usage, testimonials, or features
in product copy.

## Repository map

```text
apps/web/
  app/                         Next.js 15 App Router pages
  components/                  UI and feature components
  lib/interview/store.ts       Zustand interview state machine
  lib/ai/stream.ts             authenticated SSE client
  lib/trpc.ts                  typed tRPC client
  e2e/                         shared Playwright framework and live tests
  e2e/deterministic/           isolated desktop/mobile browser specs
  tests/e2e/                   superseded legacy mocked specs

apps/api/
  src/hono-app.ts              middleware, tRPC adapter, health, metrics
  src/routes/hono/ai.ts        SSE generation and Bedrock status
  src/trpc/routers/            typed CRUD procedures
  src/lib/documents.ts         canonical/legacy document reconciliation
  src/lib/apiKeys.ts           key verification and decryption
  src/schema.ts                Drizzle schema
  drizzle/                     committed migrations

packages/shared/src/
  types.ts                     cross-app domain types
  schemas.ts                   cross-app Zod schemas
  prompts.ts                   AI system-prompt construction
  session-types.ts             interview telemetry types
```

Do not duplicate cross-app types. Put them in `@devdocs/shared`.

## Runtime architecture

### Web

- Next.js 15 App Router and React 19
- Clerk authentication
- TanStack Query and tRPC React for server data
- Zustand for the interview state machine
- Tailwind/CSS Modules using the Vellum tokens
- `react-markdown` with `rehype-sanitize` for generated content
- JSZip for bundle export

### API

- Hono on Node.js
- tRPC Fetch adapter at `/trpc`
- PostgreSQL through Drizzle and `postgres-js`
- Clerk token verification and local UUID mapping
- AES-256-GCM user-key encryption
- optional Upstash Redis for rate limiting and AI response caching
- Pino structured logs and optional Sentry reporting

CRUD belongs in tRPC. Hono endpoints are reserved for streaming, webhooks, and
operational HTTP endpoints. The only application REST surface currently needed
is `/ai/*`, primarily `POST /ai/stream`.

## Core user flow

1. A signed-in user creates a project and chooses its type.
2. Project setup captures development team size, timeline, project funding, and experience. "Start interview" begins the interview after valid setup; project creation alone makes no AI generation request.
3. `getActiveDomains(projectType)` selects the relevant interview domains.
4. The user answers open questions, cards, or the database schema interaction.
5. AI responses stream as token deltas from the API.
6. Each completed document is persisted in `documentation_bundles`.
7. The project snapshot saves navigation, choices, messages, and completion
   state in `projects.interview_data`.
8. The user edits generated documents and exports Markdown or ZIP.

## Interview invariants

`apps/web/lib/interview/store.ts` is the central state machine. Read it before
changing interview behavior.

- Project type is selected once in the create-project modal.
- Planning asks for the product elaboration and reuses it in later prompts.
- Card choices render inline in the conversation.
- Database uses platform cards; the former schema interaction is retired.
- Internal retries must not appear as user-visible chat messages.
- Final completion state must be set before any optional closing AI message.
- `sendMessage` may still be used for post-completion clarification.
- Domain iteration, preview parsing, and ZIP export must all use
  `getActiveDomains(projectType)`, never the full domain array blindly.
- The desktop preview is visible during the interview and shows progress.
  Editing/persisting is limited to completed domains; downloads require a
  completed interview.

Domain modes:

| Mode | Domains |
|---|---|
| Open | planning, api, frontend |
| Cards | architecture, database, environment, auth, testing, monitoring, deployment |

When adding a domain, update the `DomainId` type and Zod enum, domain metadata,
opener/template logic, choices when applicable, project-type activation rules,
fixtures, and export tests.

## Persistence model

Important tables in `apps/api/src/schema.ts`:

```text
users                    Clerk identity to local UUID mapping
projects                 metadata, status, interview snapshot, soft deletion
documentation_bundles    canonical document body by project/domain
user_api_keys            encrypted provider key and masked metadata
interview_sessions       interview telemetry and completion counters
interview_messages       per-session message/timing/error telemetry
```

`projects.interview_data` is a resumable state snapshot. New clients must not
write document bodies into `domainContent`. That field remains optional only for
reading and backfilling old rows. `documentation_bundles` always wins when both
stores contain a domain.

Discovery keeps the persisted `budget` key as categorical funding context, never
a numerical infrastructure spending limit. Funding and timeline accept explicit
`not_sure` values. New setup uses `eleven_plus`, `1_under_3_months`, and
`3_under_6_months` for unambiguous boundaries. Retain legacy `large` (10+),
`1_3_months`, and `3_6_months` as original selections; never invent exact counts or
reinterpret their boundaries. Shared discovery labels are used in UI and prompts.

Project deletion is soft deletion. Account-data deletion removes the local user
row and relies on foreign-key cascades for all owned data, then directs the user
to Clerk to remove the authentication identity.

## API contract

All tRPC routers use protected procedures unless explicitly public:

```text
projects    list, get, create, update, delete
documents   list, listByProject, update
keys        list, upsert, delete
sessions    create, logMessage, update, get, listByProject
account     exportData, deleteData
```

Ownership checks should return `NOT_FOUND` for inaccessible resources rather
than disclose their existence.

AI streaming uses newline-delimited SSE data events:

```text
data: {"type":"token","text":"delta"}
data: {"type":"done","text":"full final text"}
data: {"type":"error","errorType":"...","message":"..."}
```

Token events are deltas. The browser accumulates them. The server must await
final document persistence before emitting successful completion. Unexpected
EOF is an error, not a completed response.

## AI providers and keys

Supported providers:

- Anthropic — encrypted per-user key
- OpenAI — encrypted per-user key
- Meta Muse — encrypted per-user key
- Amazon Bedrock — server-side AWS credentials only

Raw BYOK values are submitted once to `keys.upsert`, verified by the API,
encrypted with AES-256-GCM, and never returned. Only masked metadata is listed or
included in a data export. Never log raw keys, decrypted keys, authorization
headers, cookies, prompts containing secrets, or encryption material.

Meta Muse uses an explicit low reasoning effort and a shared 4,000-token total
completion budget: its private reasoning consumes the same budget as visible
text. Stream usage logging contains token counts and finish metadata only.

All providers use `buildSystemPrompt()` from `@devdocs/shared`. Do not create
provider-specific prompt copies in the web or API apps.

## Database workflow

Never use `drizzle-kit push` as the normal shared workflow. Schema changes need
a committed, reviewable migration.

```bash
# after editing apps/api/src/schema.ts
pnpm --filter @devdocs/api exec drizzle-kit generate
pnpm --filter @devdocs/api db:migrate
```

`db:migrate` uses Drizzle's runtime migrator with the committed SQL and loads
`apps/api/.env`. This avoids the installed drizzle-kit/ORM version mismatch.
It does not invoke the integration setup or truncate tables.

Review generated SQL and metadata before committing. Include compatibility SQL
when a deployed environment may have been shaped by an older push-based flow.

Tests require `TEST_DATABASE_URL` or `DATABASE_URL` with a database name that
contains `_test`. The suite migrates and truncates that database. Never weaken
this guard or point tests at a development/production database.

## Development commands

```bash
pnpm install
pnpm --filter @devdocs/api db:migrate
pnpm dev

pnpm typecheck
pnpm lint
pnpm test
pnpm build

pnpm --filter @devdocs/web test:e2e
pnpm --filter @devdocs/web test:e2e:hitl
```

Default ports are web `3000` and API `4000`.

## Environment files

- `apps/web/.env.local.example` → `apps/web/.env.local`
- `apps/api/.env.example` → `apps/api/.env`

Required API configuration includes PostgreSQL, Clerk, `WEB_URL`, and a
64-character hex `ENCRYPTION_KEY`. Redis, Sentry, Resend, and Bedrock are
optional. See the example files for exact names.

Do not commit `.env`, `.env.local`, browser storage state, provider keys, Clerk
secrets, or `.claude/settings.local.json`.

## Testing and CI

API tests are Vitest integration tests backed by PostgreSQL. Router tests should
use `appRouter.createCaller()` for typed procedures and verify ownership as well
as happy paths.

`test:unit` uses `vitest.unit.config.ts` for isolated crypto, rate-limit, SSE
client, and AI route failure tests without database setup. `test:smoke` starts
the compiled `dist/hono-server.cjs` bundle with unreachable test dependencies
and checks public health plus unauthenticated application boundaries.

There are two Playwright lanes:

1. `playwright.ci.config.ts` runs deterministic mocked specs from
   `apps/web/e2e/deterministic` with one worker, desktop/mobile projects, and
   no human pauses. Its development-only Clerk alias and API simulator require
   no external service credentials; unknown mock procedures fail explicitly.
2. `playwright.config.ts` runs the deployed/HITL framework in `apps/web/e2e`.
   The manual GitHub workflow restores a base64-encoded Clerk storage state and
   targets a configured deployed `BASE_URL`.

CI applies migrations before API tests. Do not replace this with schema push.
The deterministic browser CI job needs no secrets. The
manual deployed job requires `CLERK_PUBLISHABLE_KEY`, `BASE_URL`, and
`E2E_STORAGE_STATE_BASE64`.

Only generation requests with `persistDocument: true` write canonical documents.
Chat openers, clarification, and closing replies must never overwrite them.
Manual document edits save each domain explicitly; preserve Markdown separators
inside each body. Failed saves retain drafts and expose retry.
Unsaved document drafts and edit mode live in the interview store so mobile
sheet closure and viewport changes preserve them. Every export entry point,
including completion-chat buttons, must block while any document draft exists.
Drafts are transient and must not be written into the interview snapshot.

## Operations

```text
GET /health        metadata and uptime
GET /health/live   process liveness only
GET /health/ready  PostgreSQL dependency readiness
GET /metrics       Prometheus text metrics
```

Every API response receives an `x-request-id`. Structured completion logs include
method, path, status, duration, and request ID. Unexpected errors are logged and
sent to Sentry when configured. Keep liveness independent from dependencies;
put required dependency checks in readiness.

Redis is optional. Rate limiting fails open on Redis transport failures so an
optional dependency cannot take down AI requests. Database persistence failures
must still be surfaced to the client.

## UI conventions

Use the existing Vellum CSS variables and Tailwind tokens in
`apps/web/app/globals.css`. Prefer borders over shadows, preserve existing
typography, and do not introduce arbitrary colors when a token exists.

Generated Markdown must render through `react-markdown` and
`rehype-sanitize`. Never use unsanitized `dangerouslySetInnerHTML`.

Account identity and security are managed through Clerk. Do not implement fake
password forms, session buttons, profile data, or success toasts. Privacy export
must come from `account.exportData`; it must never include API-key ciphertext or
hashes.

## Working rules

- Preserve unrelated dirty-worktree changes.
- Use `rg`/`rg --files` for repository searches.
- Use `apply_patch` for manual file edits.
- Prefer tRPC for new CRUD operations; use Hono only where RPC is unsuitable.
- Validate ownership and soft-deletion status on project-scoped operations.
- Await persistence at externally visible lifecycle boundaries.
- Keep save retries bounded and report terminal failures to the user.
- Dashboard rename uses a modal dialog and the shared project update schema;
  submit only the name. Keep the dialog open while saving and retain failed
  drafts for retry. Restore focus to the originating project actions trigger.
- Dashboard deletion requires a confirmation dialog styled like rename, with
  Cancel focused initially and a destructive Delete project button. Keep the
  dialog open and block duplicate submissions/dismissal while deleting; expose
  errors inline for retry. Update cached project/document lists only on success.
- Dashboard action menus open 8px right of their source card, aligned with the
  trigger's top. Neighboring-card overlap is allowed. Only viewport constraints
  permit left/below fallbacks and vertical shifting, with 8px edge clearance.
- Dashboard downloads allow partial saved bundles from `projects.get.documents`,
  including empty manual edits and supported legacy domains. Never substitute
  snapshot bodies, a project description, or an AI request for saved documents.
- Update migrations, tests, README, and this file when behavior changes.
- Run typecheck, lint, relevant tests, build, and `git diff --check` in
  proportion to the change.

## Deployment

Build the web and API from the monorepo. Apply committed database migrations as
a release step before shifting traffic. Configure the API host with
`DATABASE_URL`, Clerk keys, `ENCRYPTION_KEY`, `WEB_URL`, and optional Redis,
Sentry, Bedrock, and `APP_VERSION` variables. Configure the web host with its
`NEXT_PUBLIC_*` Clerk/API URLs.

Use `/health/live` for process restart decisions and `/health/ready` for load
balancer traffic decisions. Scrape `/metrics` and connect Sentry before relying
on production alerting.

## Historical docs

Files in `docs/` include implementation plans and migration summaries written at
different stages of the project. They are useful background but may describe
retired Express routes or earlier phases. Current source code, `README.md`, and
this file are authoritative.
