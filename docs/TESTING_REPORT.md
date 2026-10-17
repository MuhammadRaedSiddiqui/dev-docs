# Current live Meta model-access failure — 2026-10-04

**Live Meta text generation is currently BLOCKED.** The user's real interview
showed repeated `404 The requested model was not found` and remained at 0/9
domains. The latest passing deterministic, unit and database checks do not
establish current live provider availability. The September 30 live logs retain
22 successful `muse-spark-1.1` streams; that historical success is not a current
provider check.

A non-generating, read-only diagnostic retrieved the same encrypted Meta key
used by the `taskflow` project, without displaying the key or credentials.
`GET /v1/models` returned 200 and listed only `muse-image-1.0`.
`GET /v1/models/muse-spark-1.1` returned 404. At the user's explicit request,
the API dispatch, key-verification model and frontend label now select
**`muse-spark-1.3-contributor`**. One real streamed provider request with that
model also returned **404 `model_not_found`**. It used the real stored key and
provider SDK; it did not exercise Clerk/browser/API routing or write a document.
There was no successful provider completion. No further generation was attempted.

Meta's [model catalog](https://dev.meta.ai/docs/models) lists the requested model,
and [error documentation](https://dev.meta.ai/docs/error-handling) explains that
404 can indicate a model unavailable to the requesting team. The current key's
catalog and rejection establish the access blocker; the underlying Meta account
permission/availability change has not been inspected. Meta project text-model
access or a privately updated key with that access is needed before a successful
live rerun can be claimed. The user also reported a 404 when updating Settings.

Product changes improve failure handling without claiming to grant provider access:

- Meta model-not-found errors now use `model_unavailable`, with clear access
  remediation and a Meta dashboard link, instead of the raw generic provider error.
- Browser SSE preserves the error category and never converts it to completion.
- API generation and Meta key verification take the requested model from shared
  configuration. The frontend label names Muse Spark 1.3 Contributor.
- Meta key verification now uses a non-generating model-access GET instead of a
  paid chat-completion ping. Invalid keys, denied model access, missing models,
  rate limits and upstream errors produce safe, distinct messages. Failed
  verification is rejected before the existing encrypted key can be replaced.

**83 isolated unit tests passed.** Two focused deterministic desktop/mobile
checks passed, verifying access guidance, dashboard link, no progress/document
mutation, viewport fit and recovery after simulated access restoration. Their
initial runs failed because the new selector also matched Next's route announcer;
scoping it to the model-access alert fixed the harness issue. Failed screenshots,
traces, videos and logs are retained separately. These two passes simulate
provider responses and do not contradict the real 404.

Forced typecheck and lint passed before the final Settings verification change.
The fresh API build (including current API typechecking) and isolated API
production smoke passed. Final web build, web smoke and server restoration are
recorded in the final evidence when complete. No full deterministic suite or
truncating PostgreSQL integration rerun was performed.

The live diagnostic reserved **$0.12691875**, including all three possible SDK
attempts and retaining the more conservative standard-tier price bound even
though the chosen model is Contributor. Cumulative agent reservations are now
**$5.08811250**: $1.76834625 prior + $3.31976625 against the additional $8.23
allowance. The remaining additional allowance is **$4.91023375**. Exact billed
spend is unverified; the failed request reservation was not released. Catalog
requests and the revised key verification generate no billable text tokens.
Current [published pricing](https://dev.meta.ai/docs/pricing-rate-limits) was
checked; no paid provider-key verification was performed by this work.

The reported project `00ee8a54-1d40-41c2-89ff-22b2a6563cae` was read only and
had no completed domains or documents during the diagnostic. Existing live
projects, original storage state and prior reports/artifacts were preserved.
No application database writes, commits or deployment occurred in this work.
The screenshot, before/after evidence, durable spending ledger and check results
are retained in `.freebuff/provider-fix/20261004-182801/`.

# Targeted real Clerk authentication — 2026-10-01

Real Clerk, the running production frontend/API and configured application
PostgreSQL were used. **Session restoration, natural JWT expiry/renewal,
sign-out boundaries and same-account reauthentication passed.** Full session
expiry, explicit backend revocation, reciprocal ownership isolation and
dedicated-account deletion are blocked, not simulated passes.

| Scenario | Actual result | Evidence / limitation |
|---|---|---|
| Saved authentication, dashboard reload and fresh browser-context restoration | **PASSED** | saved-session-rerun/results.json; original state SHA-256 assertion |
| Natural short-lived JWT expiration rejects protected API access | **PASSED** | 60-second JWT; 63,331 ms wall-clock wait; original token API 401 |
| Genuine token renewal within the same active Clerk session | **PASSED** | Later iat/exp, changed JWT, unchanged session; renewed token API 200 |
| Full Clerk session expiration / inactivity expiration | **BLOCKED** | Session expiry is days away; not shortened, time-shifted or simulated |
| Explicit supported backend session revocation; rejection before JWT expiry | **BLOCKED** | No dedicated disposable account available; existing session was not administratively revoked |
| Real UI sign-out and already-open second-tab private-data clearing | **PASSED** | Both tabs cleared private project data; signout assertions persisted before HITL timeout |
| Unauthenticated protected API requests after sign-out | **PASSED** | projects.list and documents.list returned 401 |
| Reload, project deep link, browser Back and second-tab reload after sign-out | **PASSED** | Private data absent throughout; deep link reached public sign-in, final HTTP 200 |
| Recoverable sign-in, same-account reauthentication and protected access | **PASSED** | Recovery rerun passed: old session removed, different session, API 200 and reload; separate refreshed state |
| A-to-B and B-to-A UI/API read, list, edit, export, rename and delete isolation | **BLOCKED** | CAPTCHA loop; operator chose existing-account sign-in; safety guard rejected existing identity |
| Database invariance after denied cross-account mutations | **BLOCKED** | No two-account fixture exists; no cross-account mutations attempted |
| Dedicated disposable account deletion UI and database cascade | **BLOCKED** | No account created specifically for deletion; no existing account or application data deleted |
| Deletion authentication/session behavior and other-account preservation | **BLOCKED** | Deletion not attempted; source implements local-data deletion followed by Clerk profile, not identity deletion |
| Preservation of every preexisting application database row | **PASSED** | All six table row IDs/hashes unchanged; original counts unchanged |

The observed JWT lifetime was **60 seconds**. After a **63,331 ms natural wait**,
the retained expired JWT received HTTP 401; a genuine newly minted JWT received
HTTP 200 with later issuance/expiry timestamps and the **same Clerk session**.
Dashboard reload, protected Settings and a fresh browser context using copied
saved state passed. No clocks, tokens, ownership responses or database access
were mocked or modified. Clerk distinguishes its short JWT lifetime from its
longer session lifetime in [its session model](https://clerk.com/docs/guides/how-clerk-works/overview).
Full session expiration/inactivity expiration was not exercised: those configured
deadlines were days away. UI sign-out subsequently changed the original session
to **removed**, and human sign-in created a **different session for the same user**.
Protected project API access and reload passed after recovery. This is sign-out
and reauthentication evidence, not explicit `sessions.revokeSession` coverage.

Signup in bundled Chromium encountered an operator-reported Cloudflare CAPTCHA
refresh loop. Installed Chrome was tried with normal CAPTCHA protections intact;
the operator chose sign-in instead. The safety guard proved that the signed-in
identity predated this run and rejected it as a disposable fixture. No disposable
A/B account, project, document or telemetry record was created. The four
dedicated-account-dependent Playwright cases were explicitly skipped for missing
fixtures. Read/list/edit/export/rename/delete isolation in both directions and
unchanged records after denied mutations therefore remain **unverified**.
Cloudflare documents that automated browsers can be unsupported by its challenges;
this is a possible explanation, not a proven cause of this specific loop.
[Cloudflare browser support](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/).

Deletion source review confirmed that `account.deleteData` deletes the local
`users` row and relies on foreign-key cascades for projects, documents, keys,
sessions and messages. The actual Privacy UI requires `DELETE`, calls that
endpoint, then opens Clerk account management to complete identity deletion.
The endpoint does **not** delete the Clerk identity or revoke its sessions.
Authenticated requests can auto-provision a fresh empty local user while the
identity remains active. These are implementation findings, **not live deletion
or cascade evidence**. No deletion endpoint or UI was exercised because no account
was created specifically for deletion; the existing account was preserved.

All preexisting database rows retained their IDs and whole-row hashes in all six
tables: **1 user, 35 projects, 66 documents, 1 provider key, 36 sessions and 163
messages**. The completed project `c75d5a6b-fdb8-4ffe-89dc-1209e1864221` remains
intact. No accounts or application records were deleted. Existing artifacts and
reports were copied into the new archive before writes. The original
`e2e/storage-state/user.json` is unchanged; it refers to the now removed original
session. Usable refreshed authentication is retained separately as
`saved-reauthenticated.json` in this run's archive. Original and refreshed state,
raw traces and videos are sensitive local artifacts and are not embedded in HTML.

No confirmed product defect was found and no product implementation changed.
The first restoration attempt requested a token before Clerk had loaded after
navigation; adding a readiness wait fixed that harness failure and the focused
rerun passed. The saved sign-out runner passed all recorded boundary assertions
but timed out during the human recovery pause after a long elapsed interval.
The first recovery attempt required a sign-in form even though human sign-in
had already restored access; accepting the authenticated state corrected that
selector expectation. The final standalone recovery rerun passed and established
the changed session, same identity, HTTP 200 and reload. These retained failures
are harness/interaction/environment outcomes, not product failures. Automatic
triage is heuristic; the classifications in this report use the actual evidence.

Runner executions are retained separately: **1 passed** saved-session rerun;
**1 passed** final recovery rerun; **4 skipped** disposable-dependent cases.
The saved sign-out runner failed at the HITL timeout despite its persisted passing
boundary assertions; the earlier renewal and recovery failures and interrupted
signup attempts are preserved. This is not a single all-passing live suite.
Web typecheck, frontend lint, helper syntax and `git diff --check` passed. The
standalone HTML opened at desktop/mobile sizes, verified all 14 auth rows
(8 passed / 6 blocked), renewal/recovery/database evidence and source search,
with no page errors or mobile overflow. QA screenshots and final check logs are
retained in the archive. Since
there was no product change, no fresh build, unit/integration run or full
deterministic browser rerun was needed. Earlier **141 deterministic passes / 1
skip, 73 unit passes, 25 disposable PostgreSQL integration passes and zero audit
findings** remain prior results, not expanded real-auth coverage.

Final listeners and process commands confirm the usable production real-auth
frontend on **3000, PID 10776**, and API on **4000, PID 8036**. No server was
replaced or stopped, and `.next` was not rebuilt while browser tests ran.
Final readiness returned 200; unauthenticated project/AI boundaries returned 401;
protected frontend requests returned 404 with and without the spoofed test header.
Authenticated project requests returned 200 in the final recovery test.
`PLAYWRIGHT=0` and `ENABLE_AI_TRIAGE=false` were retained.

**Zero paid provider requests, zero provider-key verification requests, and zero
AI triage requests.** Unauthenticated AI boundary probes returned 401 before any
provider call. Spending guards blocked no attempted paid operation. No commit or
deployment occurred. The truncating integration suite was not run, database
guards were unchanged, and application `DATABASE_URL` was not replaced.

Artifact archive: `.freebuff/auth-testing/20261001-200010/`. It contains copied
historical artifacts/reports, original and separate refreshed state, timestamped
runner directories, screenshots, traces, videos, sanitized API-status JSONL,
Clerk lifetime/renewal/sign-out/recovery evidence, database baseline/final hashes,
server boundary/process evidence and `final-verification-summary.json`.
`test-results/auth-runs.json` points to this summary; regenerated HTML keeps all
historical results separate and includes the actual auth scenario/attempt ledger.

The remaining work requires two disposable accounts created for testing,
including one specifically for deletion, plus a practical way to exercise real
session expiration. Backend revocation must use supported Clerk mechanisms; no
revocation, expiration, ownership or deletion result should be inferred from
deterministic coverage or source review.

---

# Testing and fixes — consolidated deterministic execution 2026-10-01

## PostgreSQL integration and production audit refresh — 2026-10-01

**25 integration tests passed across 5 files in 113.67 seconds**, with zero
failures. This is a fresh execution on real, disposable Supabase PostgreSQL
through the Session pooler, not the configured application database. Read-only
preflight verified `current_database() = devdocs_e2e_test`, an empty public
schema before migrations, and a different application host/database name.
The existing `_test` name guard stayed enabled. The suite applied committed
migrations, created test rows and truncated only this verified test target.
Post-run read-only checks found the six expected application tables and zero
rows in all six. The test schema is retained for future integration runs.

| Integration file | Passed | What was exercised |
|---|---:|---|
| projects.test.ts | 11 | Project lifecycle, ownership and validation |
| documents.test.ts | 2 | Document backfill, editing and ownership |
| sessions.test.ts | 2 | Interview-session persistence and ownership |
| account.test.ts | 2 | Owned-data export and account cascade deletion |
| keys.test.ts | 8 | Encryption, masking, rotation and preservation on provider errors |

The database is real; provider verification responses in key tests remain
doubles. These results do not expand real Clerk, paid provider or browser
coverage. `ENABLE_AI_TRIAGE=false`; no paid requests or provider-key
verification occurred. Application `DATABASE_URL`, existing live projects,
browser storage and earlier artifacts were preserved. Only the test URL's
host/path were corrected during setup, with private environment backups kept
in the ignored archive and no secrets displayed.

The direct endpoint was unreachable on this machine's IPv4 connection. After
the user selected the Session pooler, its URL still selected `postgres`; the
guard rejected it before SQL. The path was corrected to `devdocs_e2e_test`.
An initial pnpm command rejected `--outputFile` before starting tests; the
corrected command used `run test`. A cleanup helper initially misquoted a
qualified table identifier (PostgreSQL `42P01`); correcting that helper made
the read-only check pass. These were configuration/harness issues, not product
defects. Hook/test timeouts were bounded at 120/30 seconds for remote latency;
test assertions, retry behavior and the database guard were unchanged.

The fresh production audit found one **low** DOMPurify advisory in
`posthog-js@1.404.1 > dompurify@3.4.13`, with zero moderate/high/critical
findings. The root override now selects **DOMPurify 3.4.16**, the patched
version for [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p).
Only that override and its lockfile dependency references/integrity changed;
other dependency versions and existing uncommitted changes were preserved.
The post-fix `pnpm audit --prod --json` exited 0 with **zero findings across
442 production dependencies**. The advisory's special in-place sanitation
hook conditions were not reproduced in this app; this is a dependency fix,
not evidence of a confirmed application exploit.

Compatibility checks passed: forced typecheck (3 tasks), forced lint (1 task),
fresh real-auth web production build, isolated API/web production smoke and
portable HTML report verification on desktop/mobile. The report checks verify
the consolidated 142 browser rows, the new 25 integration passes, the zero-finding
audit, search, embedded screenshots and absence of mobile overflow/page errors.
The sandbox initially could not resolve Turbo; the same commands passed with
approved escalation. No application failure was confirmed.

The fresh real-auth production frontend is running on **3000, PID 10776**,
with **PLAYWRIGHT=0** and AI triage disabled. The original API remains on
**4000, PID 8036**. Final public boundary checks passed: API readiness 200,
unauthenticated project/AI endpoints 401, and frontend dashboard requests
rejected with and without a spoofed test header. No authenticated live workflow
was rerun. The previous frontend build was archived before replacement.

The first final boundary attempt failed its assertion without retaining statuses;
the next timed out without identifying the request. The monitoring helper now
retains sanitized per-request statuses/errors, including partial failures, and
cancels unused response bodies. The final check passed with the same statuses
as the earlier accepted server check (200/401/401/404/404). The cause of the
initial failures was not established; no product defect was confirmed.

The earlier consolidated deterministic
result remains **141 passed / 1 intentional skip**, run before this dependency
patch; the full browser suite was not rerun for this transitive dependency update.
The earlier real SaaS interview, document/export and library results remain
historical live coverage. Spending reservations remain **$4.96119375 cumulative**,
with **$0 newly reserved** for this refresh; exact provider billing is unverified.

Artifacts, before/after reports, dependency baselines, sanitized preflight and
cleanup evidence, both audit results and runner JSON are retained under
`.freebuff/integration-testing/20261001-152103/`. Historical root integration
and audit JSON files remain unchanged. No commit or deployment occurred.

Reproduce from the repository root after separately verifying a disposable
`TEST_DATABASE_URL`:

```powershell
node apps/api/scripts/verify-test-database.mjs
pnpm --filter @devdocs/api run test --reporter=default --reporter=json --outputFile=<new-artifact-path> --hookTimeout=120000 --testTimeout=30000
pnpm audit --prod --json
```

## Earlier consolidated browser acceptance — one complete execution

The browser continuation code passed one complete execution of
`pnpm --filter @devdocs/web test:e2e`: **142 discovered cases, 141 passed,
1 intentional skip, 0 failed, 0 flaky, 0 retry attempts and 0 runner errors**.
Playwright exited 0 and reported **43.3 minutes**; its JSON duration is
**2,600,208.689 ms (43 minutes 20.209 seconds)**, including setup and teardown.
The execution started at `2026-10-01T08:58:29.704Z`.

| Browser project | Passed | Intentional skips | Failed |
|---|---:|---:|---:|
| Desktop Chromium | 70 | 1 | 0 |
| Pixel 7 emulation | 71 | 0 | 0 |
| Consolidated total | 141 | 1 | 0 |

The desktop skip is `mobile sheets are hidden until opened and support Escape`,
annotated `Mobile sheet interaction`. Its mobile execution passed. Retries
remained disabled; the passing result is a single runner execution, rather
than a union of focused reruns.

**Scope: simulated deterministic browser coverage only.** Clerk identity, tRPC
and provider streams are mocked by the existing framework. These passes do not
verify real Clerk/API/PostgreSQL/provider behavior. AI triage stayed disabled.
No paid provider requests, provider-key verification requests, configured-database
writes, PostgreSQL integration tests or real-service interview/document/library
specs were run in this continuation. No commit or deployment occurred.

### Investigated attempts and fixes

| Execution in this continuation | Actual outcomes | Interpretation |
|---|---|---|
| Initial complete execution | 140 passed, 1 failed, 1 skip; 48.3 minutes | Desktop creation/discovery exceeded the existing 10-second assertion |
| Focused creation navigation | 4 passed; 9.4 minutes | Verified the first bounded navigation/discovery wait |
| Attempt 2, interrupted | 38 passed, 1 failed, 1 skip; 102 cases without final outcomes | Bedrock discovery retained the same short wait |
| Focused creation/discovery | 8 passed; 13.0 minutes | Verified all creation-to-discovery paths |
| Attempt 3, interrupted by Windows suspension | 58 passed, 1 failed, 1 skip; 82 cases without final outcomes | Search navigation/context teardown spanned approximately twelve hours of suspension |
| Attempt 4, interrupted | 38 passed, 1 failed, 1 skip; 102 cases without final outcomes | Template opener remained busy beyond the existing input-ready assertion |
| Focused route/interview readiness | 16 passed; 12.9 minutes | Verified creation, discovery, template opener, search and sign-out waits on both projects |
| Final consolidated execution | **141 passed, 1 skip; 43.3 minutes** | **All 142 discovered cases completed on the final code** |

Attempts 2–4 have preserved console-derived partial manifests, explicitly marked
`runnerReportFinalized=false`; they have no finalized runner JSON or reliable
whole-run duration. Any pre-existing HTML present when interrupted is retained
as historical output and is not evidence of those attempts' totals.

The timing failures had successful mocked creation/route responses and snapshots
showing navigation, hydration or the initial simulated opener still in progress.
No new product defect was confirmed. Shared page-object helpers now await the
interview/sign-in route and the existing discovery heading or enabled chat input
with bounded timeouts. They still reject an opener retry state. Affected test
budgets are 120 seconds, and warmup also compiles `/sign-in`. Selectors, outcome
assertions, mocks, case count and retry configuration remain unchanged. The
previous product fixes for draft retention and export blocking pass on both
projects in the consolidated run.

Windows sleep/wake events corroborate attempt 3's environment interruption.
The final execution used a temporary system wakefulness request, without changing
the power plan; it was released after exit 0. Windows Next development-server
teardown still hung after all test outcomes. Only the verified project frontend
and its `next dev` launcher were stopped, allowing Playwright to finalize JSON
and HTML. The API was preserved throughout.

### Verification, preservation and current evidence

- Forced final typecheck: 3 successful tasks, 0 cached; 2m10.67s.
- Forced final lint: passed with no ESLint warnings/errors, 0 cached; 2m39.938s.
- The earlier isolated unit result remains **73 passed**; it was not rerun because
  this continuation changed browser synchronization and report generation only.
- Original reports, screenshots, videos, failure traces, monitoring outputs,
  browser storage state and build artifacts were archived before replacement in
  `.freebuff/deterministic-testing/20260930-231720/`.
- Hash comparison confirms the saved browser storage file and all 507 historical
  files under `test-results/deterministic-browser/` are unchanged. Both existing
  live-testing archives remain intact. All existing uncommitted product changes
  are preserved. The configured database was not written or queried; live project
  `c75d5a6b-fdb8-4ffe-89dc-1209e1864221` was not modified or deleted.
- Final runner JSON and interactive HTML are retained in
  `complete-final-test-results/` and `complete-final-playwright-report/` under the
  archive, as well as the usual `apps/web/` output locations. Every failed
  attempt retains its screenshots, trace, video and monitor evidence.
- `test-results/deterministic-complete.json` contains actual consolidated totals,
  per-project results, skips and all 142 case identities. The resolution and
  refresh manifests retain historical executions separately. Raw runner,
  typecheck and lint logs, timing analysis, Windows suspension evidence,
  teardown records and sleep-request/release records are in the archive.

The deterministic `.next` directory was archived before a fresh web production
build with `PLAYWRIGHT=0` and `ENABLE_AI_TRIAGE=false`. Build and production smoke
passed sequentially after browser testing; no mock build was reused. Smoke
verified that browser chunks contain no mock identity and that protected routes
reject unauthenticated and spoofed requests.

The restored real-auth production frontend runs on port **3000, PID 2172**
(`next start`, not development). The original API remains on **4000, PID 8036**.
Final probes returned API readiness 200, unauthenticated tRPC/AI-stream 401 and
protected frontend 404, including a spoofed test header. These unauthenticated
boundary probes do not constitute authenticated real-service workflow coverage.
The deterministic development frontend is stopped. Production logs, build/smoke
logs and sanitized listener/boundary evidence are preserved in the archive.

`docs/TESTING_REPORT.html` was regenerated using the existing Python generator.
Its current section derives directly from the final runner JSON, lists all 142
cases and separates earlier live results and the historical 213-case ledger.
Desktop/mobile report checks passed: exact current totals and duration, all case
rows, historical/source search, no horizontal overflow and no page errors.
Report screenshots and `report-check.json` are retained in the archive.

### Remaining validation gaps

The deterministic suite has no unresolved test failures. Real service/provider
flows and PostgreSQL integrations were deliberately not rerun here; their earlier
results below remain separate historical evidence. Other browsers, physical
devices, formal accessibility, load/soak and operational failure testing remain
outside this execution. Windows development-server teardown still requires
targeted cleanup on this machine. The bounded waits address slow development
navigation without establishing a production performance guarantee.

## Earlier live continuation — completed steps 1–3 on 2026-09-30

Artifacts for this continuation are under
`.freebuff/live-testing/20260930-173121/`. Existing reports, browser storage,
screenshots, traces, videos, and root test results were copied before overwrites.
No commit, deployment, database truncation, account deletion or key verification
has been performed.

| Lane | Actual result |
|---|---|
| Complete deterministic browser regression | 123 passed, 2 failed, 1 intentional skip |
| Focused onboarding + document-preservation rerun | 20 passed |
| Draft-export defect reproduction before fix | 2 failed as expected, desktop and mobile |
| Isolated unit suite | 73 passed, including 3 durable spending-guard regressions |
| Forced typecheck / lint after draft fix | Passed |
| API build and compiled production smoke | Passed; startup smoke needed a later rerun after two empty-output startup timeouts |
| Affected browser checks after draft fix | 34 passed |
| Fresh production API/web builds | Passed, forced without cache; web build followed development-browser tests |
| Web production authentication smoke | Passed; no mock identity in chunks, protected routes reject unauthenticated/spoofed requests |
| Real Clerk/dashboard smoke | 2 passed: saved authentication setup and real authenticated dashboard/API contract |
| Full real SaaS interview | 2 passed: authentication setup and all ten domains, real Meta Muse/API/PostgreSQL |
| Real document editing, reload and exports | 2 passed: authentication setup and all ten edits, discard/save, Markdown/ZIP parsing |
| Real desktop/mobile documentation library | 3 passed: authentication setup, desktop and Pixel 7 emulation |

The two initial mobile onboarding failures timed out before navigation and
discovery hydration completed. Explicit navigation/hydration waits resolved
them in the focused rerun. Windows Next test-server shutdown also hung after
all cases finished; only the identified deterministic server was terminated,
then Playwright finished its report. One premature follow-up encountered the
occupied port and ran zero tests; its error JSON is retained.

Confirmed product defect: completion-chat download buttons bypassed the
preview's unsaved-draft guard. Both desktop and mobile browser reproductions
failed with an enabled Markdown download button. Mobile sheet closure also
discarded its component-local draft. Draft bodies and edit mode now live in
the interview store, every chat/preview export control checks that state,
and closing/resizing the preview retains drafts until save/discard. Drafts
remain transient and are excluded from persisted interview snapshots.

Resolving outcomes by file, test title and browser project across these runs
gives **141 passing unique deterministic cases and 1 intentional skip**.
This is a union of the complete regression and focused reruns, not a single
142-case run or real-service coverage.

The new full interview deliberately permits up to 30 generation requests per
attempt while keeping the cumulative $8.23 continuation ceiling. Reservations
are written to a durable ledger before traffic is forwarded and include all
three possible SDK attempts. Previous reservations are $1.76834625; exact
provider billing remains unverified. Meta standard rates were checked against
[Meta's pricing documentation](https://dev.meta.ai/docs/pricing-rate-limits).

The full live project is **`c75d5a6b-fdb8-4ffe-89dc-1209e1864221`**, named
**E2E Full SaaS 1790780207050**. It is retained for review at
`http://localhost:3000/project/c75d5a6b-fdb8-4ffe-89dc-1209e1864221/interview`.
No earlier test project was modified or removed. The previously passing partial
project `5623334d-4c02-416b-9aec-3d8de0fad37c` still has its two documents and
20% saved progress. No database migrations were needed in this continuation.

### Real interview and persistence evidence

The full interview passed in 8.5 minutes including authentication setup. A valid
saved Clerk session was reused; no credential entry or provider-key verification
was required. The fresh production services used `PLAYWRIGHT=0` and real Clerk,
and AI triage remained disabled. The budget route forwards real requests and
never supplies simulated provider responses.

The test answered planning/API/frontend normally, used platform cards, and
selected custom architecture and monitoring options. It skipped architecture,
saved/reloaded at 20%, revisited/rewound to 10%, checked that later conversation
turns were removed, then replaced the deferred section with a real generation.
Reload checkpoints at 30%, 60% and 100% verified saved completed domains,
choices and rendered user conversation. Database uses platform cards in the
current implementation; the former schema editor is retired.

Direct configured-PostgreSQL evidence verifies project status `complete`, all
ten completed domain IDs, ten distinct canonical documents, and a session with
`total_domains_completed=10`, `is_complete=true`, provider `metamuse`. Generated
documents before edits range from 1,451 to 1,859 characters and contain no
deferred placeholders. Reloads create additional sessions with earlier progress;
they are retained, not represented as additional completed interviews.

All 22 observed provider streams ended with `stop`; no UI retry was needed.
Real failure output was therefore not induced. Failed/empty/truncated generation,
false completion and preservation of prior valid documents are covered by the
isolated unit and deterministic failure lanes, including the 14 preservation
checks in the focused runs. These simulated cases are not live failure coverage.

### Real documents and library evidence

Each domain received a saved revision containing `café — اردو — 日本語 🔐`
and a Markdown horizontal rule. For every domain, the test first created an
unsaved draft, verified that chat/preview downloads and preview switching were
disabled, discarded it, then saved the revision through the real API. PostgreSQL
matched each exact body; the transient draft field was absent from the saved
project snapshot. Reload restored all ten latest edits in the UI.

Real UI downloads were saved as `DOCUMENTATION.md` and
`e2e-full-saas-1790780207050-docs.zip`. The merged Markdown exactly matched the
saved document composition, with every revision marker once. ZIP parsing found
exactly the ten applicable domain files plus `docs/README.md`; each body exactly
matched PostgreSQL, with no missing, duplicated or mixed domain revisions.
Unicode and internal horizontal rules were preserved.

Desktop and Pixel 7 emulation both searched the real documentation library,
checked empty search, navigated all ten previews, followed database/deployment
domain deep links, and downloaded those individual files with exact database
content and filenames. Desktop also exercised every sidebar domain filter;
mobile filtering uses deep links because its layout does not expose that
sidebar. Both passed horizontal-overflow and console/network checks.

Current live runs total **9 passing executions**, including 4 authentication
setup executions and 5 feature executions. This is Chromium desktop/mobile
emulation coverage, not a run of the deterministic suite against real services.

### Spending, failures, artifacts and server status

| Spending evidence | USD |
|---|---:|
| Previously reserved, exact billing unverified | 1.76834625 |
| New reservations across 22 requests, including three possible SDK attempts each | 3.19284750 |
| Cumulative reservations | 4.96119375 |
| Remaining from the additional 8.23 allowance | 5.03715250 |

The durable ledger is `provider-spend.json` in this continuation's archive.
Observed successful streams reported 33,830 prompt tokens and 13,516 completion
tokens, including 6,264 reasoning tokens. At the checked standard rates these
observed tokens imply approximately **$0.09973050**, but that is neither an
invoice nor complete billing evidence for possible internal SDK attempts/cache
accounting. Exact billed spend remains unverified. Document/library checks made
no generation requests, and no provider-key verification request was sent.

The first new live smoke failed before authentication because the sandbox
blocked browser networking. It passed after network access was granted. The
first library attempt ran zero tests because a device descriptor included the
worker-only `defaultBrowserType` option inside a describe group; narrowing it
to context options fixed the harness. Both failed attempts and their available
artifacts are retained. A package-level typecheck invocation rejected an invalid
`--force` flag; the correct root Turbo command then passed all three packages
without cache. No additional product defect was found in the live runs.

The archive contains original reports/storage/results, deterministic failures
and reruns, live smoke/full interview/document/library reports, screenshots,
monitoring JSON, videos and failure traces, the project run record, downloaded
files, database evidence and spending/usage evidence. Root manifests
`test-results/refresh-runs.json` and `test-results/live-runs.json` distinguish
these executions from historical results. Raw browser traces, videos and storage
state remain sensitive local artifacts and are not embedded in the HTML.

The regenerated standalone HTML opened in Chromium at desktop and mobile
widths, showed the current totals separately from the historical ledger, and
passed test/source search checks with no JavaScript errors. Fifteen embedded
screenshots include historical layouts and current live evidence; the report
check and its screenshots are retained in the archive.

The freshly built real production frontend remains on port **3000** (PID 4704)
and API on **4000** (PID 8036), with logs and PID files in the archive. Final
readiness is 200, unauthenticated API calls are 401, and protected frontend
requests—including a spoofed test header—are rejected with 404. The temporary
deterministic development server is stopped. No commit or deployment occurred.

### Earlier remaining gaps — consolidated browser gap superseded above

- The 141 resolved deterministic passes are simulated browser coverage. Real
  service coverage is the specific SaaS, editing/export and library flows above.
- Only configured Meta Muse and Chromium desktop/Pixel 7 emulation were used
  live. Other providers, browsers, physical devices, session expiry/MFA/account
  management, load/soak and formal accessibility were not verified.
- Real provider failures, Redis outages/concurrency, deployment, backup/restore
  and monitoring delivery remain untested live. Provider document quality and
  optional closing-message filename/stack claims were not acceptance checks;
  actual downloaded filenames and content were verified independently.
- The truncating PostgreSQL integration suite and production dependency audit
  were not rerun in the live continuation. The October 1 disposable-database and production audit refresh above supersedes this gap.
- The complete deterministic suite was run before the draft fix; affected checks
  were rerun afterward. The 141 passes/1 skip are resolved unique outcomes across
  those runs, not a single complete 142-case execution.

## Historical partial live validation — earlier 2026-09-30

- Clerk API secret accepted; public frontend JWKS and authenticated backend
  JWKS contain the same signing key. Web/API secret values match; no configured
  key values were displayed. The optional API publishable key is absent.
- The configured PostgreSQL database is reachable. It contained 1 linked user,
  27 projects, 52 documents, 1 provider key, 24 sessions, and 112 messages.
- Legacy session counters/flags and timing fields had text types. Applied both
  committed migrations with Drizzle's runtime migrator; confirmed integer and
  boolean types, two migration-history entries, and unchanged row counts.
  The truncating integration suite was not run.
- `drizzle-kit migrate` refused to run because the installed CLI was older than
  the ORM. `db:migrate` now uses the runtime migrator and committed SQL, loading
  the configured API environment without truncation.
- Fresh API/web processes launched with `PLAYWRIGHT=0`. The first headed auth
  attempt displayed `Mock sign-in boundary`: Next reused compiled code from the
  previous deterministic lane. Interrupted that attempt, preserved its artifacts
  and `.next`, added Clerk mode to Webpack's cache version, and rebuilt cleanly.
- The second headed run completed human Clerk login. API logs confirm a real
  authenticated `GET /trpc/projects.list` returned HTTP 200 and queried the
  mapped database user's 2 active projects (request ID
  `f9fd8087-8ef0-49e1-8895-d9f6d84f695d`). Its terminal pause did not receive
  ENTER through Playwright's worker stdin. Interrupted and archived this attempt.
- Auth setup now waits for the real Clerk form and uses network/console fixtures;
  its HITL pause resumes after the authenticated dashboard becomes visible.
  The third run passed auth setup, then found a real missing-favicon 404 in the
  dashboard console. Added an SVG icon and conventional favicon redirect.
  Preserved the failure screenshot/video/trace and reran using the saved session.
- **Live smoke: 2 passed (authentication setup + dashboard), 0 failures**,
  1.3 minutes. `projects.list` returned HTTP 200; response contract, network,
  and console checks were clean. The saved browser identity maps to the
  configured database user with the same 2 active projects.
- Readable monitor logs now redact Clerk session/handshake/JWT URL parameters,
  nested redirects, bearer values, and JWTs in console messages. An earlier raw
  monitor inspection included sensitive handshake URLs in local tool output;
  subsequent inspection filters to API metadata. Earlier logs and
  raw traces/storage state remain sensitive local artifacts; do not publish them.
- User authorized **$10 USD** for Meta Muse. The partial live interview test
  passed, using the existing encrypted key through the real API. It selects the
  provider through Settings, caps requests at 5, reserves a conservative cost
  before each request (including SDK retries), waits for two completed domains,
  and reloads to check persisted progress. Across all attempts, 14 browser
  generation requests reserved **$1.76834625** conservatively, including three
  possible SDK attempts per request. The passing run used five requests and
  reserved $0.67791. Exact billed spend is not measured. The ten generations
  after usage logging was enabled reported 9,579 prompt and 5,815 completion
  tokens: about $0.03669 at standard token prices. This excludes the four earlier
  generations without usage records and is not an invoice total.
  Meta's published standard prices are $1.25/M input and $4.25/M output tokens:
  [pricing](https://dev.meta.ai/docs/pricing-rate-limits).
- Interview attempts exposed harness defects: Settings clicked before client
  hydration; cold interview compilation exceeded the 15-second navigation
  wait; the resilient heading lookup expired before discovery hydrated; valid
  provider question wording differed from the static expected strings; hidden
  mobile controls made textarea selectors ambiguous. Page objects now wait for
  real data/hydration, use visible controls, and check a completed question.
- A real Meta Muse generation returned empty visible output while its opener
  succeeded. No document was persisted and the app surfaced a recoverable
  error. Meta's documented reasoning shares the output budget; the adapter had
  only 2,000 tokens with unspecified effort. Changed Meta only to low reasoning
  and a shared 4,000-token completion budget, requested usage, logged numeric
  token/finish metadata, and rejected empty text within the adapter. Live
  verification of this mitigation succeeded in two subsequent two-domain flows;
  the cause of the original
  empty response is inferred from the provider's documented budget behavior.
  [Meta reasoning documentation](https://dev.meta.ai/docs/reasoning).
- The first successful two-domain flow failed its final monitor assertion:
  the browser cancelled completed SSE readers, producing `net::ERR_ABORTED`.
  The SSE client now drains the server close after a terminal event. A regression
  verifies successful completion does not cancel the reader. The monitor
  retains expected superseded Next navigation aborts with a cancellation reason,
  narrowly requiring a same-origin GET, RSC header/query, and `ERR_ABORTED`.
  API stream failures remain failures.
- **Live partial interview: 2 passed (authentication setup + interview),
  0 failures**, 4.5 minutes. All five `/ai/stream` responses returned HTTP 200
  with no stream aborts. Contract checks and console/API network checks were
  clean. Planning and architecture completed; reload retained 20% progress and
  canonical documents. Screenshot reviewed visually.
- Direct database verification of passing project
  `5623334d-4c02-416b-9aec-3d8de0fad37c` found the planning document (1,227
  characters), architecture document (1,593 characters), both completed domains,
  and seven persisted message records with no error types. Session telemetry
  recorded two completed domains; reload started a separate session. Detailed
  session lifecycle/counter accuracy is not an acceptance assertion of this flow.
- Final database counts: 1 user, 34 projects, 56 documents, 1 provider key,
  31 sessions, and 131 messages. Seven `E2E Interview` projects from exploratory
  and passing runs are retained for review, along with four generated documents.
  No account/key deletion or truncating integration suite was performed.
- Smoke assertions now wait for a successful `projects.list` response and
  completed asynchronous network/contract monitoring before checking errors.
- Previous reports, screenshots, results, storage state, and the stale cache
  were archived under `.freebuff/live-testing/20260930-122849/`. The final
  deterministic browser artifacts are also copied to
  `test-results/deterministic-browser/` so HTML regeneration keeps the original
  125 passes and intentional skip separate from current live results.
- The live lane has authentication setup, dashboard smoke, and one partial
  interview flow. It does not run the 125 deterministic cases against real
  services. Existing deterministic/unit/integration results below are
  historical results, not reruns against the configured database.

Validation of these changes: **70 unit tests passed**, including 4 new
artifact-redaction, 2 Meta reasoning/empty-response, 1 SSE completion, and
1 navigation-cancellation regression. All three packages typechecked; frontend
lint, API build/startup smoke, Node syntax checks, and `git diff --check` passed.
Web production build and authentication smoke also passed after stopping the
development server; production chunks contain no mock identity and protected
routes reject unauthenticated/spoofed-header requests. No commit or deployment
was performed.

Review servers remain available: the freshly built production frontend at
`http://localhost:3000` with `PLAYWRIGHT=0`, and the real API at port 4000.
Passing live artifacts are preserved separately as
`smoke-passed-apps_web_test-results` and `interview-passed-apps_web_test-results`
inside the archive; failed attempts retain their monitoring, screenshots,
videos, and failure traces. The current Playwright report is the passing partial
interview. The standalone HTML embeds historical evidence and a separate live
results table with the final interview screenshot.

## Scope

The existing Playwright framework now runs deterministic feature and failure
tests on desktop Chromium and Pixel 7 emulation. It retains the framework's
page objects, network/console logs, failure classification, videos, traces,
screenshots, and agent feedback. The live Clerk/provider lane remains separate.

| Area | Automated checks |
|---|---|
| Projects | All six types, required fields, create failure/retry, rename, delete, ownership, soft deletion, progress denominators |
| First use | Anthropic/OpenAI/Meta Muse verification, invalid keys, verification outage/retry, configured Bedrock |
| Interviews | All active domains for every project type, custom choices, skip, rewind, reload, keyboard selection, per-project provider, history |
| Recovery | Auth/rate-limit/network/persistence errors, malformed/empty/incomplete SSE, retry without duplicate messages, snapshot retries, malformed stored data |
| Documents | Canonical persistence, per-domain editing, failed-save drafts, horizontal rules/Unicode, regeneration, search, deep links, Markdown and parsed ZIP downloads |
| Settings/account | Key storage/removal/rotation, provider selection, Bedrock status, export without raw key material, account-data deletion confirmation/failure |
| UI | Desktop/mobile layouts, horizontal overflow, visible controls, mobile dialogs/focus/Escape, search keyboard handling, screenshot artifacts |
| Security boundaries | AES-GCM tamper detection, ownership, unauthorized API requests, Markdown XSS payloads, production dependency audit |
| API/operations | Compiled server startup, health, metrics, retired REST route, authenticated tRPC/SSE boundaries, migrations, sessions |

These are feature and boundary checks. They do not constitute measured 100%
statement/branch coverage or proof that production cannot fail.

## Confirmed results

- Browser suite: **125 passed, 1 skipped, 0 failures, 0 flaky tests** in one
  126-case run (21.7 minutes). The skip is the desktop instance of a mobile-only
  sheet test. No unexpected console errors were found across the artifacts.
- Isolated API/provider/browser-stream suite: **62 passed**, including the
  long-history regression added after the full browser run.
- PostgreSQL integration suite: **25 passed** using a newly initialized local
  PostgreSQL 15.18 cluster, committed migrations, and a database named
  `devdocs_e2e_test`. Provider verification was mocked; database writes and
  encryption were real. The temporary server was stopped afterward.
- Compiled API smoke: **passed**.
- Production dependency audit: **0 findings** across the 441 dependencies
  reported by `pnpm audit --prod`.
- Typecheck: **all three packages passed**. Frontend lint: **passed**.
- Agent failure digest: **no failed tests**. `git diff --check`: **passed**.
- Web production build: **passed**. Production authentication smoke: **passed**:
  homepage/security headers, unauthenticated protected routes, spoofed test and
  middleware headers, and absence of mock identity in shipped browser chunks.

Earlier browser runs found test-selector ambiguity after the Next upgrade and
when a mobile document dialog covered the chat download button. The selectors
were corrected. They also exposed a real homepage overflow defect, which was
fixed with responsive navigation and content grids.

The production smoke initially failed because the harness mixed `127.0.0.1`
and `localhost`, causing Clerk's internal rewrite to become a proxy request.
Using the same listening and request hostname resolved the harness failure.

## Product defects fixed

1. AI chat openers and clarification replies could overwrite saved documents.
   Only explicit generation requests now persist documents, and completion
   waits for persistence.
2. Empty or truncated provider replies could be marked complete. They now
   produce recoverable errors. Cancellation clears the stream timeout and
   stops the provider request.
3. Retrying a failed generation lost its completion action. Retry now preserves
   the original action and avoids duplicating the user's chat message.
4. Skipped domains were local-only. Deferred documentation now saves before
   progress advances, with a retry path on failure.
5. Editing merged Markdown by splitting horizontal rules could mix domain
   content. Editing now saves each domain explicitly, retains failed drafts,
   and disables export while changes are unsaved.
6. Failed project hydration could leave an indefinite skeleton. Load errors
   now display a retry action; malformed saved interview fields are validated.
7. Several mutations lacked visible failure handling. Project/template errors
   now show feedback, and retrying template initialization reuses its project.
8. Mobile layouts, action-menu positioning, hidden sheet focus, key-input
   masking, document/settings deep links, and search edge cases were corrected.
9. A request header could enable the web authentication bypass. Mock identity
   now requires an explicit development test server; production uses Clerk.
10. The compiled API could not start because of unresolved module imports.
    It now builds a runnable Node bundle, checked by a startup smoke test.
11. The rate-limit counter and expiry were separate operations. A single Redis
    script now updates both and repairs keys with no expiry.
12. Vulnerable production dependencies were updated, including Next 15.5.24,
    React 19 compatibility, Hono, Drizzle, and affected transitive packages.
13. Long generated replies could exceed the API's 4,000-character history limit
    on the next request. Only the recent context sent to the provider is now
    bounded; stored messages and exported documents remain intact.

The Next upgrade addresses published advisories, including the
[Windows server advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36).

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm --filter @devdocs/api test:unit
pnpm --filter @devdocs/api test       # requires disposable TEST_DATABASE_URL
pnpm --filter @devdocs/api build
pnpm --filter @devdocs/api test:smoke
pnpm --filter @devdocs/web exec playwright install chromium
pnpm --filter @devdocs/web test:e2e
pnpm --filter @devdocs/web report:agent
pnpm --filter @devdocs/web build
pnpm --filter @devdocs/web test:smoke
pnpm audit --prod
```

Run the browser development server and production build sequentially: they
share `.next`. CI provides its own PostgreSQL 15 service. Never weaken the test
database-name guard: integration setup migrates and truncates its target.

## Historical remaining validation — superseded where stated above

- Basic real Clerk login and authenticated database-backed dashboard access now
  pass (see the live section). Full session expiry/account management, other
  providers, and complete real-service interviews remain outside verified scope.
  The September 27 run did not modify the configured remote database; the
  September 30 run applied existing migrations and authorized live test activity.
- Redis Lua behavior is tested with a client double; a real Upstash outage and
  concurrent traffic exercise has not been performed.
- Safari/WebKit, Firefox, physical mobile devices, assistive technologies,
  formal contrast/accessibility audits, and visual baseline comparisons have
  not been certified by this run. Screenshots are review artifacts.
- Load/soak tests, deployment infrastructure, backup/restore, monitoring
  delivery, and provider output quality remain separate release checks.
- Deploy web and API together: new generation calls explicitly send
  `persistDocument: true`; older callers omit this flag.

Local artifacts are under `apps/web/playwright-report`, `apps/web/test-results`,
and root `test-results`. They are ignored by Git. CI uploads browser artifacts.
