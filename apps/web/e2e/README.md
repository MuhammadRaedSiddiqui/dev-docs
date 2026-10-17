# E2E framework (`apps/web/e2e/`)

Playwright E2E for DevDocs AI. Deterministic specs extend the shared monitoring
framework through `lib/mock-fixtures.ts`; live specs use `lib/fixtures.ts`.

## Test lanes

| Command | Dependencies | Scope |
|---|---|---|
| `pnpm --filter @devdocs/web test:e2e` | Installed Chromium | Desktop and Pixel 7, stateful API simulator, development-only mock Clerk |
| `pnpm --filter @devdocs/api test:unit` | None outside the workspace | Crypto, rate limits, AI HTTP/SSE boundaries and browser SSE parsing |
| `pnpm --filter @devdocs/api test` | Disposable PostgreSQL database with `_test` in its name | Migrations, tRPC CRUD, ownership, documents, sessions, account data |
| `pnpm --filter @devdocs/web test:e2e:hitl --headed` | Dedicated test account and authorized provider spend | Real Clerk, API, database and provider |

The deterministic suite lives in `e2e/deterministic/`; the former
`tests/e2e/` specs are superseded. It covers all six project types, active domain
progression, reload, parsed ZIP contents, document edits, retry/failure paths,
project actions, templates, key settings, privacy, search, deep links, mobile
sheets, keyboard interaction, layout overflow, and Markdown sanitization.
Screenshots are review artifacts, not pixel-comparison baselines.

Mock traffic cannot prove database behavior, provider output quality, real
authentication, or production capacity. The integration setup migrates and
truncates its test database. Never provide a development or production database.
Live tests can create projects and make billable AI requests; use a disposable
account with a configured provider key. Saved sessions are validated against
the dashboard; expired CI sessions fail with a refresh instruction.

## How this maps to the app

| Framework piece | App structure it reflects |
|---|---|
| `lib/pages/DashboardPage.ts` | `/dashboard` — project grid + `CreateProjectModal` (project **type is captured once here** as a locked chip) |
| `lib/pages/InterviewPage.ts` | `/project/[id]/interview` — progress, chat with inline card pickers, and per-domain document editing/export; mobile uses sheets |
| `lib/pages/SettingsPage.ts` | `/settings` — sidebar sections; API keys go through typed tRPC mutations (never `localStorage`) |
| `contracts/projects.list.schema.json` | tRPC `projects.list` (dashboard) |
| `contracts/projects.get.schema.json` | tRPC `projects.get` (interview hydration) |
| Auth | Clerk — **no first-party login endpoint**, so there is no login contract schema; `tests/auth.setup.ts` drives `/sign-in` + HITL pause instead |

Interview transitions are state/visibility waits, not page loads — only
dashboard/settings/interview entry use `page.goto()`.

## Running

For local live tests, start fresh API and web processes with `PLAYWRIGHT=0`.
Archive `playwright-report/` and `test-results/` before running: both lanes use
the same output paths. Set `SKIP_WEBSERVER=1` only after verifying those processes
use real Clerk. Run `example.smoke.spec.ts --headed --workers=1` first; it waits
for a successful authenticated `projects.list` response and completed contract
validation. The live lane contains authentication setup, dashboard smoke,
partial/full interviews, document editing/export and desktop/mobile library
checks; it does not run the deterministic cases against real services. Agree on a
provider spending limit before running `interview.e2e.spec.ts`.

For the currently budgeted Meta Muse flow, set `E2E_PROVIDER=metamuse` and
`E2E_PROVIDER_SPEND_USD` to the remaining authorized USD amount. The test selects
the existing provider through Settings, permits at most five real generation
requests, reserves input/output cost including SDK retries, waits for planning
and architecture completion, and reloads to verify saved progress. Subtract
reservations recorded by previous attempts when retrying. The reservation is a
conservative bound, not a provider invoice. Other providers currently skip this
budgeted flow until their pricing calculation is configured. No keys are entered
or reverified by this test.

Full SaaS validation uses `full-live.e2e.spec.ts` with a deliberate 30-request
per-attempt guard. Set `PLAYWRIGHT=0`, `ENABLE_AI_TRIAGE=false`,
`E2E_PROVIDER=metamuse`, `E2E_PROVIDER_SPEND_USD=8.23`, and absolute paths for
`E2E_SPEND_LEDGER` and `E2E_RUN_RECORD` inside the new artifact archive. The
ledger reserves all three possible SDK attempts before forwarding each request
and survives reruns; the run record reuses the same clearly named test project.
The continuation starts with $1.76834625 previously reserved. These are
conservative reservations, not invoices. Never reset the ledger to retry.

Run the full interview separately with one worker, then
`live-documents.e2e.spec.ts`, then `live-library.e2e.spec.ts`. The document lane
checks each saved body directly against configured PostgreSQL, reloads, blocks
exports while drafts are dirty, and parses real UI Markdown/ZIP downloads.
Library checks use desktop and Pixel 7 contexts. Read-only database evidence is
captured by `apps/api/scripts/live-project-evidence.mjs`; no integration setup,
truncation, provider-key entry or provider-key verification is involved.
Archive both Playwright directories before each execution. If a Windows test
server hangs after all cases finish, identify and stop only that test server,
wait for the runner's final report, and archive it before starting another run.

```bash
cp apps/web/e2e/.env.example apps/web/e2e/.env
pnpm --filter @devdocs/web test:e2e:hitl --headed       # live; HITL uses terminal prompts
pnpm --filter @devdocs/web test:e2e                    # deterministic mocked PR suite
pnpm --filter @devdocs/web exec playwright test --debug # native Inspector (authoring, separate from HITL)
pnpm --filter @devdocs/web test:ai -- "describe a new flow"  # draft into tests/drafts/
pnpm --filter @devdocs/web report:agent                # Markdown digest after a run
npx playwright show-report
```

Docker: `docker compose -f apps/web/e2e/docker-compose.yml run --rm e2e`.

The manual GitHub workflow targets a deployed `BASE_URL` and requires
`E2E_STORAGE_STATE_BASE64`, containing the base64-encoded Clerk storage-state
file. This avoids an interactive login inside an inaccessible CI browser.

## Targeted real authentication checks

`playwright.auth.config.ts` runs only `real-auth.e2e.spec.ts`, using the shared
fixtures, monitoring, HITL helper and `AuthenticationPage`. Start real-auth web
and API servers first with `PLAYWRIGHT=0` and `ENABLE_AI_TRIAGE=false`. Create a
new timestamped `.freebuff/auth-testing/` directory, archive existing reports
and storage, and put its absolute path in `current-run.txt`. The config writes
each `AUTH_ATTEMPT` to that directory, preserving previous attempts. Never reuse
an attempt name. Original `e2e/storage-state/user.json` is copied and hash checked;
successful reauthentication writes a separate state in the archive.

Run from `apps/web`:

```powershell
$env:PLAYWRIGHT='0'
$env:ENABLE_AI_TRIAGE='false'
$env:AUTH_ATTEMPT='<unique-attempt-name>'
$env:AUTH_BROWSER_CHANNEL='chrome' # optional installed Chrome; normal CAPTCHA
node node_modules/@playwright/test/cli.js test --config playwright.auth.config.ts
```

Only newly created disposable accounts qualify for fixture creation, revocation
or local-data deletion. Separate A/B storage states are kept in the archive.
The API evidence helper captures row hashes read-only and never runs integration
setup. Fixtures use supported authenticated project/document/session procedures,
with no AI generation or key verification. Provider routes are blocked as a
spending guard; authentication, ownership and database responses are real.
Natural short-token expiry is waited out; clocks and auth responses are never
modified. Session lifetime and token lifetime are recorded separately. CAPTCHA
or missing disposable accounts are reported as blockers, never passing coverage.

The optional `04b` saved-account sign-out check requires
`AUTH_SAVED_SIGNOUT=1` and a separate `saved-reauthenticated.json` copy in the
archive. It leaves application records intact and requires human sign-in again.
Do not delete or revoke an existing identity. The deletion UI removes local data
and opens Clerk account management; it does not delete the Clerk identity.

## Adding a new Page Object

1. Create `lib/pages/<Name>Page.ts` extending `BasePage`.
2. Define locators via `this.find(primary, description, fallbacks)` with real
   selectors from the component markup (primary) + 1–2 fallbacks.
3. Expose action methods that combine steps (`submitCredentials()`,
   `applyPromoCode()`), using full navigation (`goto`/`waitForURL`) only where
   the app really navigates.
4. Compose flows in specs from Page Object methods — no raw locators in specs.

## Adding a new HITL pause point

```ts
await hitl("Complete the CAPTCHA, then resume", { timeoutMs: 5 * 60_000 });
```

Local: terminal block, ENTER resumes / `SKIP` skips. CI: webhook to
`HITL_WEBHOOK_URL`, resume via `POST /resume/:token` (`Authorization: Bearer
$HITL_RESUME_SECRET`, `{"action":"skip"}` to skip). Timeouts throw
`HITLTimeoutError` after teardown artifacts are captured. The resume port
(`HITL_RESUME_PORT`, default 9234) must be operator-only (VPN/tunnel) —
never public.

Authentication also resumes automatically when the human completes Clerk login
and the dashboard's authenticated controls become visible. Playwright workers
may not receive the parent terminal's stdin; this condition avoids a stuck
ENTER prompt. Auth setup waits for the real Clerk form before pausing and uses
the same console/network monitoring fixtures as feature tests.

The network log retains superseded Next Server Component navigation aborts with
a cancellation reason. Only same-origin GET requests with the RSC header/query
and `net::ERR_ABORTED` receive this classification; failed API streams still fail
the test. Successful SSE clients drain the server's close rather than cancelling
the completed request.

## Adding a contract schema

1. Write `contracts/<name>.schema.json` (JSON Schema draft-07).
2. Pass it per-spec: `attachNetworkMonitor(page, testInfo, [{ urlPattern: /…/, schemaPath: "e2e/contracts/<name>.schema.json" }])` (relative to `apps/web`, which is the Playwright cwd).
3. Checking is opt-in per matched pattern — unmatched URLs never fail.

## Triage categories

`classifyFailure()` runs on every failure (fixture teardown) and writes
`triage.json`: `likely_contract_break` (schema violations) >
`likely_app_bug` (4xx/5xx on first-party calls) > `likely_selector_drift`
(locator/timeout error, no healed fallback) > `likely_environment`
(connection/DNS/BASE_URL) > `likely_flaky` (passed on retry / no signal) >
`unclassified`. Deterministic and offline; `ENABLE_AI_TRIAGE=true` adds a
Claude `aiOpinion` for unclassified/low-confidence cases (never fails the test).

## Promoting a draft spec

`tests/drafts/*.spec.ts` are **tracked** (team PR review) but excluded from
the default run via `testIgnore`. Promote after human review:

```bash
mv apps/web/e2e/tests/drafts/<slug>.spec.ts apps/web/e2e/tests/
```

## Rotating `storage-state/user.json`

Delete `apps/web/e2e/storage-state/user.json` and re-run — `auth.setup.ts`
re-drives `/sign-in` with an HITL pause at the manual step, then re-saves
state. The file is gitignored; every other spec starts authenticated via
`test.use({ storageState: "e2e/storage-state/user.json" })`.

## Agent feedback

`report:agent` (post-run npm script — chosen over `globalTeardown` so the
digest also works on downloaded CI artifacts without re-running) scans
`test-results/` and writes `test-results/agent-feedback.json`: one trimmed
entry per failed test (triage, assertion, failed/contract-violating network
excerpts, console errors, healed selectors, screenshot/video paths).
