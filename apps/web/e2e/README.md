# E2E framework (`apps/web/e2e/`)

Playwright + human-in-the-loop E2E for DevDocs AI. All specs import from
`lib/fixtures.ts` — never from `@playwright/test` directly.

## How this maps to the app

| Framework piece | App structure it reflects |
|---|---|
| `lib/pages/DashboardPage.ts` | `/dashboard` — project grid + `CreateProjectModal` (project **type is captured once here** as a locked chip) |
| `lib/pages/InterviewPage.ts` | `/project/[id]/interview` — hybrid single view with 3 regions: `DomainProgress` (left), `ChatPanel` (center, card pickers render **inline** via `showCards`), `PreviewPanel` (right, hidden until `isComplete`) |
| `lib/pages/SettingsPage.ts` | `/settings` — sidebar sections; API keys go through typed tRPC mutations (never `localStorage`) |
| `contracts/projects.list.schema.json` | tRPC `projects.list` (dashboard) |
| `contracts/projects.get.schema.json` | tRPC `projects.get` (interview hydration) |
| Auth | Clerk — **no first-party login endpoint**, so there is no login contract schema; `tests/auth.setup.ts` drives `/sign-in` + HITL pause instead |

Interview transitions are state/visibility waits, not page loads — only
dashboard/settings/interview entry use `page.goto()`.

## Running

```bash
cp apps/web/e2e/.env.example apps/web/e2e/.env
pnpm --filter @devdocs/web exec playwright test        # headed locally, HITL uses terminal prompts
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
