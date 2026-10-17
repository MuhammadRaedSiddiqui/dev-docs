"""Reconcile real auth evidence; never executes tests or contacts services."""
from pathlib import Path
from datetime import datetime, timezone
import json

root = Path(__file__).resolve().parents[1]
run = Path((root / '.freebuff/auth-testing/current-run.txt').read_text().strip())

def load(file):
    data = (run / file).read_bytes()
    return json.loads(data.decode('utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'))

renewal, signout, recovery, database = [load(file) for file in
    ['renewal.json', 'saved-signout.json', 'saved-recovery.json', 'final-database.json']]
assert renewal['sameSession'] and renewal['expiredTokenStatus'] == 401 and renewal['renewedTokenStatus'] == 200
assert all(signout[k] is True for k in ['primary', 'secondTab', 'reload', 'deepLink', 'back', 'secondTabReload'])
assert signout['unauthProjectsStatus'] == signout['unauthDocumentsStatus'] == 401
assert recovery['sameAccount'] and recovery['differentSession'] and recovery['oldSessionStatus'] == 'removed'
assert all(database['preexistingUnchanged'].values()) and not database['owned']
assert not any(load('accounts.json').get(label) for label in ['A', 'B'])
assert (root / 'apps/web/e2e/storage-state/user.json').read_bytes() == (run / 'saved-original-copy.json').read_bytes()
scenarios = [
    {'scenario': 'Saved authentication, dashboard reload and fresh browser-context restoration', 'status': 'passed', 'evidence': 'saved-session-rerun/results.json; original state SHA-256 assertion'},
    {'scenario': 'Natural short-lived JWT expiration rejects protected API access', 'status': 'passed', 'evidence': '60-second JWT; 63,331 ms wall-clock wait; original token API 401'},
    {'scenario': 'Genuine token renewal within the same active Clerk session', 'status': 'passed', 'evidence': 'Later iat/exp, changed JWT, unchanged session; renewed token API 200'},
    {'scenario': 'Full Clerk session expiration / inactivity expiration', 'status': 'blocked', 'evidence': 'Session expiry is days away; not shortened, time-shifted or simulated'},
    {'scenario': 'Explicit supported backend session revocation; rejection before JWT expiry', 'status': 'blocked', 'evidence': 'No dedicated disposable account available; existing session was not administratively revoked'},
    {'scenario': 'Real UI sign-out and already-open second-tab private-data clearing', 'status': 'passed', 'evidence': 'Both tabs cleared private project data; signout assertions persisted before HITL timeout'},
    {'scenario': 'Unauthenticated protected API requests after sign-out', 'status': 'passed', 'evidence': 'projects.list and documents.list returned 401'},
    {'scenario': 'Reload, project deep link, browser Back and second-tab reload after sign-out', 'status': 'passed', 'evidence': 'Private data absent throughout; deep link reached public sign-in, final HTTP 200'},
    {'scenario': 'Recoverable sign-in, same-account reauthentication and protected access', 'status': 'passed', 'evidence': 'Recovery rerun passed: old session removed, different session, API 200 and reload; separate refreshed state'},
    {'scenario': 'A-to-B and B-to-A UI/API read, list, edit, export, rename and delete isolation', 'status': 'blocked', 'evidence': 'CAPTCHA loop; operator chose existing-account sign-in; safety guard rejected existing identity'},
    {'scenario': 'Database invariance after denied cross-account mutations', 'status': 'blocked', 'evidence': 'No two-account fixture exists; no cross-account mutations attempted'},
    {'scenario': 'Dedicated disposable account deletion UI and database cascade', 'status': 'blocked', 'evidence': 'No account created specifically for deletion; no existing account or application data deleted'},
    {'scenario': 'Deletion authentication/session behavior and other-account preservation', 'status': 'blocked', 'evidence': 'Deletion not attempted; source implements local-data deletion followed by Clerk profile, not identity deletion'},
    {'scenario': 'Preservation of every preexisting application database row', 'status': 'passed', 'evidence': 'All six table row IDs/hashes unchanged; original counts unchanged'},
]
attempts = []
for directory in sorted(run.iterdir()):
    if not directory.is_dir() or directory.name.startswith('before-'):
        continue
    file = directory / 'results.json'
    attempt = {'name': directory.name, 'runnerJsonRetained': file.is_file(), 'cases': []}
    if file.is_file():
        result = json.loads(file.read_text(encoding='utf-8-sig'))
        def collect(suites):
            for suite in suites:
                for spec in suite.get('specs', []):
                    for test in spec.get('tests', []):
                        results = test.get('results', [])
                        attempt['cases'].append({'name': spec['title'], 'runnerStatus': results[-1]['status'] if results else 'not-run',
                                                 'durationMs': sum(r.get('duration', 0) for r in results)})
                collect(suite.get('suites', []))
        collect(result.get('suites', []))
    attempts.append(attempt)

summary = {
    'at': datetime.now(timezone.utc).isoformat(), 'artifactDirectory': run.relative_to(root).as_posix(),
    'scenarios': scenarios, 'attempts': attempts, 'renewal': renewal, 'sessionLifetime': load('session-lifetime.json'),
    'signout': signout, 'recovery': recovery, 'database': database,
    'servers': {'webPort': 3000, 'webPid': 10776, 'apiPort': 4000, 'apiPid': 8036, 'mode': 'production-real-auth',
                'PLAYWRIGHT': '0', 'ENABLE_AI_TRIAGE': False},
    'spending': {'paidProviderRequests': 0, 'providerKeyVerificationRequests': 0, 'aiTriageRequests': 0},
    'confirmedProductDefects': [], 'productChanges': [],
    'checks': {'webTypecheck': 'passed', 'webLint': 'passed', 'helperSyntax': 'passed', 'diffCheck': 'passed',
               'fullDeterministicRerun': False, 'unitRerun': False, 'integrationRerun': False, 'buildRerun': False},
    'retained': {'newDisposableAccounts': [], 'newProjects': [], 'removedAccounts': [], 'removedApplicationRecords': [],
                 'completedLiveProject': 'c75d5a6b-fdb8-4ffe-89dc-1209e1864221',
                 'originalStorageStatePreserved': True, 'replacementStorageState': 'saved-reauthenticated.json'},
    'committed': False, 'deployed': False,
}
(run / 'final-verification-summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
manifest = root / 'test-results/auth-runs.json'
assert not manifest.exists(), 'Archive the auth manifest before replacing it'
manifest.write_text(json.dumps({'summary': (run / 'final-verification-summary.json').relative_to(root).as_posix()}, indent=2) + '\n', encoding='utf-8')
report = root / 'docs/TESTING_REPORT.md'
prior = report.read_text(encoding='utf-8')
section = '''# Targeted real Clerk authentication — 2026-10-01

Real Clerk, the running production frontend/API and configured application
PostgreSQL were used. **Session restoration, natural JWT expiry/renewal,
sign-out boundaries and same-account reauthentication passed.** Full session
expiry, explicit backend revocation, reciprocal ownership isolation and
dedicated-account deletion are blocked, not simulated passes.

'''
section += '| Scenario | Actual result | Evidence / limitation |\n|---|---|---|\n'
section += ''.join(f"| {s['scenario']} | **{s['status'].upper()}** | {s['evidence']} |\n" for s in scenarios)
section += '''
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
Web typecheck, frontend lint, helper syntax and `git diff --check` passed. Since
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

'''
report.write_text(section + prior, encoding='utf-8')
print(json.dumps({'scenariosPassed': sum(s['status'] == 'passed' for s in scenarios),
                  'scenariosBlocked': sum(s['status'] == 'blocked' for s in scenarios),
                  'summary': summary['artifactDirectory'] + '/final-verification-summary.json'}))
