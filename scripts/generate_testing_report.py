"""Build a portable, offline report from this run's results and working-tree diff.

Run from any directory: python scripts/generate_testing_report.py
No packages, network access, or credentials required. Does not run application tests.
"""
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter
import base64
import difflib
import hashlib
import html
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/TESTING_REPORT.html'
GENERATOR = Path(__file__).relative_to(ROOT).as_posix()


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, capture_output=True).stdout.decode('utf-8')


def read(file):
    data = (ROOT / file).read_bytes()
    return data.decode('utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig')


def esc(value):
    return html.escape(str(value), quote=True)


def json_file(file):
    return json.loads(read(file))


def relative(file):
    return str(file).replace(str(ROOT).replace('\\', '/') + '/', '').replace(str(ROOT) + '\\', '').replace('\\', '/')


def badge(status):
    color = 'pass' if status == 'passed' else 'skip' if status in ('skipped', 'pending', 'blocked', 'interrupted') else 'fail'
    return f'<span class="badge {color}">{esc(status)}</span>'


def pretty_json(data):
    return esc(json.dumps(data, ensure_ascii=False, indent=2))


def inline(text):
    text = esc(text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'\[([^\]]+)\]\((https://[^)]+)\)', r'<a href="\2">\1</a>', text)


def markdown(text):
    """Small renderer for the committed report's headings, tables, lists and code."""
    blocks, paragraph, listing, table, code = [], [], [], [], None

    def flush():
        if paragraph:
            blocks.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            paragraph.clear()
        if listing:
            blocks.append('<ul>' + ''.join('<li>' + inline(item) + '</li>' for item in listing) + '</ul>')
            listing.clear()
        if table:
            rows = [r for r in table if not re.match(r'^\|[- :|]+\|$', r)]
            blocks.append('<div class="table-wrap"><table>' + ''.join('<tr>' + ''.join(f'<{"th" if i == 0 else "td"}>{inline(c.strip())}</{"th" if i == 0 else "td"}>' for c in row.strip('|').split('|')) + '</tr>' for i, row in enumerate(rows)) + '</table></div>')
            table.clear()

    for line in text.splitlines():
        if line.startswith('```'):
            if code is None:
                flush()
                code = []
            else:
                blocks.append('<pre>' + esc('\n'.join(code)) + '</pre>')
                code = None
        elif code is not None:
            code.append(line)
        elif line.startswith('#'):
            flush()
            level = min(len(line) - len(line.lstrip('#')) + 1, 4)
            blocks.append(f'<h{level}>' + inline(line.lstrip('# ')) + f'</h{level}>')
        elif not line.strip():
            flush()
        elif line.startswith('|'):
            table.append(line)
        elif re.match(r'^(?:- |\d+\. )', line):
            listing.append(re.sub(r'^(?:- |\d+\. )', '', line))
        elif listing and line.startswith(' '):
            listing[-1] += ' ' + line.strip()
        else:
            paragraph.append(line.strip())
    flush()
    return ''.join(blocks)


# Human-readable explanations accompany the complete, unabridged diff appendix.
DESCRIPTIONS = {
    'packages/shared/src/types.ts': 'Share the 4,000-token Meta Muse completion budget between the real provider adapter and live test spending guard.',
    '.github/workflows/ci.yml': 'Run database and isolated unit suites, desktop/mobile deterministic E2E, upload artifacts, and smoke-test production API/web builds.',
    'CLAUDE.md': 'Update architecture, Next/React versions, testing lanes, document persistence invariants, and agent working guidance.',
    'README.md': 'Document current architecture, testing commands, save behavior, and link the run report.',
    'apps/api/package.json': 'Use a runnable bundled API entry point; add unit/smoke scripts and upgrade vulnerable dependencies/build tooling.',
    'apps/api/build.mjs': 'Bundle the API as Node CommonJS using esbuild; include shared workspace source and externalize third-party packages.',
    'apps/api/scripts/smoke-build.mjs': 'Start the actual compiled API with isolated configuration and check health, metrics, authentication and retired REST routes.',
    'apps/api/src/lib/aiStream.ts': 'Validate provider completion reasons for Anthropic, Bedrock, OpenAI and Meta Muse; reject truncated or filtered responses.',
    'apps/api/src/lib/crypto.ts': 'Require exactly 64 hexadecimal encryption-key characters and safely mask short provider keys.',
    'apps/api/src/lib/rateLimit.ts': 'Atomically increment Redis counters and set/repair expiry using Lua; preserve fail-open behavior on Redis errors.',
    'apps/api/src/routes/hono/ai.ts': 'Validate JSON and legacy context, reject empty output, explicitly opt into document persistence, save before completion, and handle cancellation safely.',
    'apps/api/src/routes/projects.test.ts': 'Replace obsolete REST tests with real PostgreSQL tRPC project lifecycle, ownership and validation checks.',
    'apps/api/vitest.config.ts': 'Exclude isolated unit files from the database integration lane.',
    'apps/api/vitest.unit.config.ts': 'Add an isolated Node unit lane that does not load destructive database setup.',
    'apps/web/app/(app)/dashboard/page.tsx': 'Surface mutation errors; implement rename validation; avoid false download success.',
    'apps/web/app/(app)/docs/page.tsx': 'Support domain deep links, mobile document navigation and responsive layout.',
    'apps/web/app/(app)/project/[id]/interview/page.tsx': 'Validate hydration snapshots, expose retry for load failure, and use Next 15-compatible route parameters.',
    'apps/web/app/(app)/settings/page.tsx': 'Honor settings deep links and adapt sidebar/content layout to mobile widths.',
    'apps/web/app/(app)/templates/page.tsx': 'Show initialization failures and reuse the created project when retrying a partially failed template operation.',
    'apps/web/app/landing.module.css': 'Add responsive navigation/content grids/footer; contain the roadmap badge within its pricing card.',
    'apps/web/components/dashboard/CreateProjectModal.tsx': 'Mask provider-key entry and add an accessible label with autocomplete disabled.',
    'apps/web/components/dashboard/DashboardSidebar.tsx': 'Constrain and scroll mobile sidebar content.',
    'apps/web/components/dashboard/ProjectCard.tsx': 'Compute progress from applicable domains and keep the actions menu inside the viewport.',
    'apps/web/components/docs/DocList.tsx': 'Adapt document navigation sizing for mobile.',
    'apps/web/components/docs/DocsSidebar.tsx': 'Adapt the document sidebar to its responsive container.',
    'apps/web/components/interview/ChoiceCard.tsx': 'Prevent disabled mouse/keyboard activation and expose correct focus/disabled semantics.',
    'apps/web/components/interview/DomainPicker.tsx': 'Add keyboard arrow, Home and End navigation and prevent interaction with historical choices.',
    'apps/web/components/interview/ErrorBanner.tsx': 'Expose recoverable persistence errors in the interview error UI.',
    'apps/web/components/interview/PreviewPanel.tsx': 'Edit per domain with explicit Save/Discard, retain failed drafts, regenerate sections, and block export while dirty.',
    'apps/web/components/layout/Navbar.tsx': 'Provide an accessible mobile search control and responsive navigation spacing.',
    'apps/web/components/layout/SearchModal.tsx': 'Guard keyboard selection when search produces no results.',
    'apps/web/components/settings/ApiKeySection.tsx': 'Mask key inputs, improve labels and disable autocomplete.',
    'apps/web/components/settings/SettingsSidebar.tsx': 'Constrain and scroll sidebar content at narrow widths.',
    'apps/web/components/ui/BottomSheet.tsx': 'Unmount closed sheets, use unique accessible IDs and restore focus after closing.',
    'apps/web/e2e/README.md': 'Document deterministic/live lanes, fixtures, test limitations and safe database/account requirements.',
    'apps/web/e2e/lib/fixtures.ts': 'Flush asynchronous network monitoring before evaluating and attaching test evidence.',
    'apps/web/e2e/lib/monitoring/consoleMonitor.ts': 'Stop silently ignoring hydration-related browser errors.',
    'apps/web/e2e/lib/monitoring/networkMonitor.ts': 'Avoid duplicate listeners, wait for pending response validation and reject non-JSON contract responses.',
    'apps/web/e2e/lib/pages/DashboardPage.ts': 'Align shared dashboard page-object locators and actions with the current application UI.',
    'apps/web/e2e/lib/pages/InterviewPage.ts': 'Update interview page-object selectors for current choices and document actions.',
    'apps/web/e2e/lib/pages/SettingsPage.ts': 'Update settings key-input locators and supported provider controls.',
    'apps/web/e2e/tests/auth.setup.ts': 'Validate saved session expiry and actual dashboard access; require explicit session refresh when invalid in CI.',
    'apps/web/e2e/tests/interview.e2e.spec.ts': 'Retain the earlier real-service two-domain scenario with guarded provider spending.',
    'apps/web/lib/ai/provider.ts': 'Fall back to Anthropic when local storage contains an unsupported provider.',
    'apps/web/lib/ai/stream.ts': 'Robustly parse fragmented SSE, validate event schemas, release/cancel readers, map errors and bound recent history to the API limit.',
    'apps/web/lib/interview/store.ts': 'Preserve retry actions, prevent concurrent replies/stale callbacks, save skipped domains and deduplicate resumed progress.',
    'apps/web/lib/interview/snapshot.ts': 'Validate stored interview fields independently and recover safely from malformed legacy data.',
    'apps/web/middleware.ts': 'Remove request-header authentication bypass; permit mock identity only on an explicit development test server.',
    'apps/web/next.config.mjs': 'Alias mock Clerk only for development E2E; set workspace tracing root and remove obsolete Next configuration.',
    'apps/web/package.json': 'Upgrade Next/React and compatible tooling; add production smoke and reliable local Playwright/report script entry points.',
    'apps/web/playwright.ci.config.ts': 'Run deterministic desktop and Pixel 7 projects with route warmup, one worker, no retries and diagnostic reports.',
    'apps/web/playwright.config.ts': 'Keep the live lane on real Clerk and prevent authentication setup from running as a regular browser feature test.',
    'apps/web/e2e/lib/mock-fixtures.ts': 'Use isolated stateful API mocks and fail unknown procedures, crashes and unexpected browser errors.',
    'apps/web/e2e/lib/mocks/application.ts': 'Implement per-test tRPC state and controlled HTTP/SSE failures for feature, persistence and recovery coverage.',
    'apps/web/e2e/lib/mocks/clerk.tsx': 'Provide a development-only mock identity and stable token/profile controls for deterministic tests.',
    'apps/web/e2e/lib/pages/WorkspacePage.ts': 'Add semantic workspace helpers, enabled-choice selection and dialog-scoped downloads.',
    'apps/web/e2e/scripts/smoke-production.mjs': 'Verify shipped bundles have no mock identity, public homepage/security headers, and protected routes reject spoofed/unauthenticated requests.',
    'apps/web/e2e/scripts/warmup.ts': 'Compile development routes before feature assertions to avoid cold-start timeouts.',
    'apps/web/e2e/tsconfig.scripts.json': 'Run report and AI-authoring scripts with compatible CommonJS TypeScript settings.',
    'package.json': 'Override affected transitive production packages to patched versions.',
    'packages/shared/src/schemas.ts': 'Add explicit persistDocument opt-in and a shared 4,000-character history-message limit.',
    'pnpm-lock.yaml': 'Record the complete resolved dependency and peer graph after security/framework upgrades.',
    'docs/TESTING_REPORT.md': 'Record coverage, defects fixed, verified results, reproduction commands and outstanding release checks.',
    GENERATOR: 'Generate this standalone HTML evidence report, including searchable test results, screenshots and full file diffs.',
    'apps/api/scripts/live-preflight.mjs': 'Check configured Clerk instance and database schema without displaying secrets; preserve redacted evidence.',
    'apps/api/scripts/migrate-configured.mjs': 'Apply committed migrations through the runtime migrator without invoking truncating test setup.',
    'apps/web/e2e/lib/hitl/pauseForHuman.ts': 'Resume human login after verified dashboard visibility when Playwright worker stdin is disconnected.',
    'apps/web/app/icon.svg': 'Provide the app icon that was missing in the real browser smoke test.',
    'apps/web/app/favicon.ico/route.ts': 'Redirect conventional favicon requests to the SVG app icon to eliminate the console 404.',
    'apps/web/e2e/lib/monitoring/redact.ts': 'Redact session, handshake, bearer and JWT values in readable browser monitoring artifacts.',
    'apps/web/e2e/lib/pages/BasePage.ts': 'Allow bounded control-specific waits for hydration and real provider responses in live page objects.',
    'apps/api/src/lib/e2e-redaction.unit.test.ts': 'Verify artifact redaction and narrowly classify cancelled Next navigation requests; historical ledger remains separate.',
    'apps/web/e2e/lib/monitoring/cancellation.ts': 'Classify only same-origin GET Server Component requests cancelled with ERR_ABORTED; retain cancellation evidence and all API failures.',
    'apps/web/components/interview/ChatPanel.tsx': 'Block completion-chat Markdown and ZIP downloads while documents have unsaved drafts or generation is busy.',
    'apps/web/e2e/lib/live-budget.ts': 'Durably reserve Meta Muse cost before forwarding each request; retain cumulative spend across attempts and bound SDK retries.',
    'apps/web/e2e/lib/live-evidence.ts': 'Capture read-only configured PostgreSQL evidence for explicitly identified live test projects.',
    'apps/api/scripts/live-project-evidence.mjs': 'Read project snapshots, canonical documents and telemetry without querying credentials or altering records.',
    'apps/api/src/lib/live-budget.unit.test.ts': 'Verify reservation persistence before forwarding, cumulative ceiling enforcement and retained request guards.',
    'apps/web/e2e/tests/full-live.e2e.spec.ts': 'Complete a guarded real-service SaaS interview with skip/revisit, rewind, database checkpoints and restored conversation.',
    'apps/web/e2e/tests/live-documents.e2e.spec.ts': 'Edit all ten real documents, discard drafts, reload, and parse actual Markdown/ZIP browser downloads against PostgreSQL.',
    'apps/web/e2e/tests/live-library.e2e.spec.ts': 'Exercise real-service library search, domain filters, deep links and previews on desktop and Pixel 7 emulation.',
    'apps/web/e2e/scripts/live-server-evidence.mjs': 'Check real-server public/authentication boundaries without displaying redirect URLs, bodies or authentication headers.',
}

browser_artifacts = ROOT / 'test-results/deterministic-browser'
if not browser_artifacts.is_dir():
    browser_artifacts = ROOT / 'apps/web/test-results'
browser = json.loads((browser_artifacts / 'results.json').read_text(encoding='utf-8-sig'))
unit = json_file('test-results/api-unit.json')
integration = json_file('test-results/api-integration.json')
audit = json_file('test-results/dependency-audit.json')
rows = []


def walk(suites, parents=()):
    for suite in suites:
        for spec in suite.get('specs', []):
            for test in spec['tests']:
                results = test.get('results', [])
                last = results[-1] if results else {}
                status = last.get('status', 'not run')
                evidence = []
                for attempt, result in enumerate(results):
                    for attachment in result.get('attachments', []):
                        if attachment['contentType'] != 'application/json':
                            continue
                        if attachment.get('path'):
                            file = Path(attachment['path'])
                            if browser_artifacts != ROOT / 'apps/web/test-results':
                                try:
                                    file = browser_artifacts / file.relative_to(ROOT / 'apps/web/test-results')
                                except ValueError:
                                    pass
                            data = file.read_text(encoding='utf-8') if file.is_file() else 'Artifact no longer available.'
                        elif attachment.get('body'):
                            data = base64.b64decode(attachment['body']).decode('utf-8')
                        else:
                            continue
                        try:
                            data = json.dumps(json.loads(data), ensure_ascii=False, indent=2)
                        except ValueError:
                            pass
                        evidence.append(f'<details><summary>{esc(attachment["name"])} · attempt {attempt + 1}</summary><pre>{esc(data)}</pre></details>')
                annotations = test.get('annotations', []) + last.get('annotations', [])
                metadata = {'outcome': test.get('status'), 'expectedStatus': test.get('expectedStatus'), 'annotations': annotations,
                            'attempts': [{k: r.get(k) for k in ('status', 'duration', 'startTime', 'retry', 'errors')} for r in results]}
                rows.append({'lane': 'Browser', 'project': test.get('projectName', ''), 'name': ' › '.join((*parents, spec['title'])),
                             'file': spec.get('file', suite.get('file', '')), 'line': spec.get('line'), 'status': status,
                             'duration': sum(r.get('duration', 0) for r in results), 'evidence': '<pre>' + pretty_json(metadata) + '</pre>' + ''.join(evidence)})
        walk(suite.get('suites', []), (*parents, suite['title']))


walk(browser['suites'])
for lane, report in [('Unit', unit), ('PostgreSQL', integration)]:
    for suite in report['testResults']:
        for result in suite['assertionResults']:
            rows.append({'lane': lane, 'project': 'Node / isolated doubles' if lane == 'Unit' else 'PostgreSQL 15.18',
                         'name': result['fullName'], 'file': relative(suite['name']), 'line': None, 'status': result['status'],
                         'duration': result.get('duration', 0) or 0, 'evidence': '<pre>' + pretty_json(result) + '</pre>'})

assert len(rows) == 213, f'Unexpected test count: {len(rows)}'
counts = Counter(row['status'] for row in rows)
assert counts == {'passed': 212, 'skipped': 1}, counts
live_rows = []
live_run_totals = []
live_sources = []
live_files = set()
manifest_file = ROOT / 'test-results/live-runs.json'
if manifest_file.is_file():
    manifest = json.loads(manifest_file.read_text(encoding='utf-8-sig'))
    def walk_live(suites, run_name, parents=()):
        for suite in suites:
            for spec in suite.get('specs', []):
                spec_file = relative(spec.get('file', ''))
                live_files.add(spec_file if spec_file.startswith('apps/') else 'apps/web/e2e/tests/' + spec_file)
                for test in spec.get('tests', []):
                    attempts = test.get('results', [])
                    last = attempts[-1] if attempts else {}
                    live_rows.append((run_name, test.get('projectName', ''), spec['title'], last.get('status', 'pending'), sum(a.get('duration', 0) for a in attempts)))
            walk_live(suite.get('suites', []), run_name, (*parents, suite.get('title', '')))
    for run in manifest['runs']:
        source = ROOT / run['report']
        if source.is_file():
            live_sources.append(run['report'])
            result = json.loads(source.read_text(encoding='utf-8-sig'))
            totals = {k:result.get('stats', {}).get(k, 0) for k in ('expected','unexpected','skipped','flaky')}
            totals['runnerErrors'] = len(result.get('errors', []))
            live_run_totals.append(f'<tr><td>{esc(run["name"])}</td><td><pre>{pretty_json(totals)}</pre></td><td><code>{esc(run["report"])}</code></td></tr>')
            walk_live(result.get('suites', []), run['name'])
live_section = '<section id="live"><h2>Live service results — 2026-09-30</h2><p>These executions use real Clerk, API and the configured PostgreSQL database. Paid interviews use the existing Meta Muse key. Deterministic browser passes do not establish real-service coverage. Read the findings for completion, persistence, export evidence, cumulative reservations and remaining gaps.</p><div class="table-wrap"><table><thead><tr><th>Run</th><th>Project</th><th>Test</th><th>Result</th><th>Duration</th></tr></thead><tbody>' + ''.join(f'<tr><td>{esc(run)}</td><td>{esc(project)}</td><td>{esc(name)}</td><td>{badge(status)}</td><td>{duration / 1000:.1f}s</td></tr>' for run,project,name,status,duration in live_rows) + '</tbody></table></div><p>Raw traces, videos and storage state remain local artifacts. Monitor logs redact authentication parameters. Exact provider billing is unverified.</p></section>'

live_section = live_section.replace('</section>', '<p>Sandbox or configuration failures can stop before reaching services; they do not establish live coverage.</p><div class="table-wrap"><table><thead><tr><th>Execution</th><th>Runner totals</th><th>Source</th></tr></thead><tbody>' + ''.join(live_run_totals) + '</tbody></table></div></section>')

# Preserve the original 213-row historical ledger. Refreshed runs, including
# initial failures and focused reruns, have their own evidence and totals.
refresh_section = ''
refresh_sources = []
refresh_manifest = ROOT / 'test-results/refresh-runs.json'
if refresh_manifest.is_file():
    refresh = json.loads(refresh_manifest.read_text(encoding='utf-8-sig'))
    refresh_table = []
    for run in refresh.get('runs', []):
        source = ROOT / run['report']
        if not source.is_file():
            continue
        refresh_sources.append(run['report'])
        result = json_file(run['report'])
        if 'stats' in result:
            stats = result['stats']
            totals = {k: stats.get(k, 0) for k in ('expected', 'unexpected', 'skipped', 'flaky')}
            totals['runnerErrors'] = len(result.get('errors', []))
            if result.get('runnerReportFinalized') is False:
                totals['runnerErrors'] = None
                totals['statisticsSource'] = result['statisticsSource']
                totals['recordedCompletedCases'] = result['recordedCompletedCases']
                totals['remainingCasesWithoutFinalOutcome'] = result['remainingCasesWithoutFinalOutcome']
        else:
            totals = {k: result.get(k) for k in ('numPassedTests', 'numFailedTests', 'numPendingTests', 'success')}
        refresh_table.append(f'<tr><td>{esc(run["name"])}</td><td>{esc(run.get("scope", ""))}</td><td><pre>{pretty_json(totals)}</pre></td><td><code>{esc(run["report"])}</code></td></tr>')
    refresh_section = '<section id="refresh"><h2>Current regression verification</h2><p>Initial failures and focused reruns are separate executions. The October 1 integration refresh uses a separately verified disposable database; its setup migrates and truncates that test target. Production audit evidence before and after the DOMPurify patch is retained below. Original historical totals remain unchanged.</p><div class="table-wrap"><table><thead><tr><th>Run</th><th>Scope</th><th>Actual runner totals</th><th>Evidence</th></tr></thead><tbody>' + ''.join(refresh_table) + '</tbody></table></div>'
    for item in refresh.get('evidence', []):
        file = ROOT / item['path']
        if file.is_file():
            refresh_sources.append(item['path'])
            refresh_section += f'<details><summary>{esc(item["name"])}</summary><pre>{pretty_json(json_file(item["path"]))}</pre></details>'
    refresh_section += '</section>'

# Keep the historical ledger intact; current acceptance comes from one runner.
consolidated_section = ''
consolidated_manifest = ROOT / 'test-results/deterministic-complete.json'
if consolidated_manifest.is_file():
    consolidated = json.loads(consolidated_manifest.read_text(encoding='utf-8-sig'))
    report_path = consolidated['report']
    complete = json_file(report_path)
    refresh_sources.extend(['test-results/deterministic-complete.json', report_path])
    complete_cases = []

    def walk_complete(suites):
        for suite in suites:
            for spec in suite.get('specs', []):
                for test in spec.get('tests', []):
                    attempts = test.get('results', [])
                    last = attempts[-1] if attempts else {}
                    complete_cases.append({
                        'title': spec['title'], 'file': spec.get('file', suite.get('file')),
                        'project': test.get('projectName'), 'outcome': test.get('status'),
                        'status': last.get('status', 'not run'),
                        'durationMs': sum(r.get('duration', 0) for r in attempts),
                        'retries': [r.get('retry', 0) for r in attempts],
                        'annotations': test.get('annotations', []),
                    })
            walk_complete(suite.get('suites', []))

    walk_complete(complete.get('suites', []))
    complete_stats = {**complete.get('stats', {}), 'discoveredCases': len(complete_cases),
                      'runnerErrors': len(complete.get('errors', [])),
                      'retryAttempts': sum(sum(r > 0 for r in c['retries']) for c in complete_cases)}
    case_rows = ''.join(f'<tr><td>{esc(c["project"])}</td><td>{esc(c["title"])}</td><td>{badge(c["status"])}</td><td>{c["durationMs"] / 1000:.3f}s</td></tr>' for c in complete_cases)
    consolidated_section = '<section id="consolidated"><h2>Consolidated deterministic browser execution</h2><p>One complete execution on the final code, using simulated Clerk, API and provider responses on desktop Chromium and Pixel 7 emulation. This does not verify real Clerk, API, PostgreSQL or providers. Historical executions remain separate below.</p><pre>' + pretty_json(complete_stats) + '</pre><p>Runner evidence: <code>' + esc(report_path) + '</code></p><details><summary>All discovered deterministic cases</summary><div class="table-wrap"><table><thead><tr><th>Project</th><th>Case</th><th>Result</th><th>Duration</th></tr></thead><tbody>' + case_rows + '</tbody></table></div></details><details><summary>Intentional skips and runner errors</summary><pre>' + pretty_json({'skips': [c for c in complete_cases if c['status'] == 'skipped'], 'errors': complete.get('errors', [])}) + '</pre></details></section>'
tracked = git('diff', 'HEAD', '--name-only', '-z').strip('\0').split('\0')
untracked = git('ls-files', '--others', '--exclude-standard', '-z').strip('\0').split('\0')
excluded = [p for p in untracked if p.startswith('.claude/') or '__pycache__' in Path(p).parts]
files = sorted({p for p in tracked + untracked if p and p not in excluded and p != 'docs/TESTING_REPORT.html'})
file_cards = []
additions = deletions = 0
for file in files:
    is_new = file in untracked
    try:
        source = read(file)
    except UnicodeDecodeError:
        source = None
    if source is None:
        diff = f'Binary asset; text diff unavailable. Size: {(ROOT / file).stat().st_size:,} bytes.'
    elif is_new:
        diff = ''.join(difflib.unified_diff([], source.splitlines(keepends=True), fromfile='/dev/null', tofile='b/' + file))
    else:
        diff = git('diff', 'HEAD', '--no-ext-diff', '--no-color', '--', file)
    added = sum(line.startswith('+') and not line.startswith('+++') for line in diff.splitlines())
    removed = sum(line.startswith('-') and not line.startswith('---') for line in diff.splitlines())
    additions += added
    deletions += removed
    description = DESCRIPTIONS.get(file)
    if description is None and ('.test.' in file or '.spec.' in file):
        tests = [r for r in rows if r['file'].endswith(file) or file.endswith('/' + r['file'])]
        description = f'Add regression and behavior tests; {len(tests)} recorded executions in this report. See matching entries in the test ledger.'
    if description is None:
        description = 'Binary asset retained and identified by size and SHA-256; contents are not text-rendered.' if source is None else 'Working-tree file retained in the source inventory; consult the current findings for scope and authorship.'
    digest = hashlib.sha256((ROOT / file).read_bytes()).hexdigest()
    formatted_diff = '\n'.join(f'<span class="{"add" if l.startswith("+") else "del" if l.startswith("-") else "hunk" if l.startswith("@@") else "context"}">{esc(l)}</span>' for l in diff.splitlines())
    file_cards.append(f'<details class="file-card" data-search="{esc(file + " " + description)}"><summary><span>{esc(file)}</span><small>{"New" if is_new else "Modified"} · +{added} / −{removed}</small></summary><div class="detail-body"><p>{esc(description)}</p><p class="muted hash">SHA-256: {digest}</p><pre class="diff">{formatted_diff}</pre></div></details>')

test_cards = []
for index, row in enumerate(rows, 1):
    location = row['file'] + (f':{row["line"]}' if row['line'] else '')
    search = ' '.join(str(row[k]) for k in ('lane', 'project', 'name', 'file', 'status'))
    test_cards.append(f'<details class="test-card" data-search="{esc(search)}" data-status="{esc(row["status"])}" data-lane="{esc(row["lane"])}"><summary><span class="test-number">{index:03}</span><span class="test-title">{esc(row["name"])}<small>{esc(row["lane"])} · {esc(row["project"])} · {esc(location)}</small></span>{badge(row["status"])}<span class="duration">{row["duration"] / 1000:.3f}s</span></summary><div class="detail-body">{row["evidence"]}</div></details>')

screenshots = []
for file in sorted((ROOT / 'test-results').glob('layout-*.png')):
    title = file.stem.replace('layout-', '').replace('-_', ' · /')
    data = base64.b64encode(file.read_bytes()).decode('ascii')
    screenshots.append(f'<figure><figcaption>{esc(title)}</figcaption><a href="data:image/png;base64,{data}" download="{esc(file.name)}" aria-label="Download {esc(title)} screenshot"><img loading="lazy" src="data:image/png;base64,{data}" alt="{esc(title)} layout screenshot"></a></figure>')

for source in live_sources:
    for file in (ROOT / source).parent.rglob('live-interview.png'):
        data = base64.b64encode(file.read_bytes()).decode('ascii')
        complete = 'full-live' in str(file)
        caption = 'Full live Meta Muse interview after reload — ten completed domains' if complete else 'Earlier partial live interview — two completed domains'
        screenshots.append(f'<figure><figcaption>{caption}</figcaption><a href="data:image/png;base64,{data}" download="live-interview.png"><img loading="lazy" src="data:image/png;base64,{data}" alt="{caption}"></a></figure>')
    for pattern in ('live-edits-reloaded.png', 'library-deployment.png'):
        for file in (ROOT / source).parent.rglob(pattern):
            data = base64.b64encode(file.read_bytes()).decode('ascii')
            screenshots.append(f'<figure><figcaption>{esc(file.parent.name)} — {esc(file.name)}</figcaption><img loading="lazy" src="data:image/png;base64,{data}" alt="Live saved documentation and library verification"></figure>')

executed_files = {r['file'] for r in rows}
not_run = []
for directory in ['apps/web/e2e/tests', 'apps/web/tests/e2e']:
    for file in sorted((ROOT / directory).rglob('*.ts')):
        if not ('.spec.' in file.name or file.name == 'auth.setup.ts'):
            continue
        label = 'Superseded legacy suite; not used for final acceptance' if '/tests/e2e' in directory else ('Executed in separate September 30 live results' if file.relative_to(ROOT).as_posix() in live_files else 'Live account/provider lane; not executed')
        not_run.append(f'<tr><td><code>{esc(file.relative_to(ROOT).as_posix())}</code></td><td>{label}</td></tr>')

evidence_paths = [relative(browser_artifacts / 'results.json'), 'test-results/api-unit.json', 'test-results/api-integration.json', 'test-results/dependency-audit.json', 'docs/TESTING_REPORT.md']
evidence_paths.extend(live_sources)
evidence_paths.extend(refresh_sources)
evidence_rows = []
for file in evidence_paths:
    path = ROOT / file
    evidence_rows.append(f'<tr><td><code>{file}</code></td><td>{path.stat().st_size:,} bytes</td><td class="hash">{hashlib.sha256(path.read_bytes()).hexdigest()}</td></tr>')
generated = datetime.now(timezone.utc).isoformat(timespec='seconds')
commit = git('rev-parse', 'HEAD').strip()
css = '''
:root{color-scheme:light;--ink:#172d36;--muted:#516771;--line:#dbe4e7;--accent:#087d77;--paper:#fff;--bg:#f1f5f6}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}header{background:#102d35;color:#fff;padding:52px max(24px,calc((100vw - 1240px)/2)) 36px}h1{font-size:clamp(30px,4vw,50px);letter-spacing:-1.5px;line-height:1.15;margin:10px 0 20px}h2{font-size:27px;margin-top:0}h3{font-size:21px}.eyebrow{text-transform:uppercase;letter-spacing:2px;font-size:12px;color:#8fe3ce}.subtitle{max-width:820px;color:#cfdee2}.meta{font-size:12px;color:#afc9d0}nav{position:sticky;top:0;z-index:3;background:#fff;border-bottom:1px solid var(--line);padding:12px 24px;display:flex;gap:22px;overflow:auto}nav a{color:var(--ink);text-decoration:none;white-space:nowrap;font-weight:600}main{max-width:1288px;margin:auto;padding:24px}section{background:var(--paper);padding:28px;border:1px solid var(--line);border-radius:12px;margin:0 0 24px;scroll-margin-top:76px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-bottom:24px}.metric{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px}.metric strong{font-size:34px;display:block;line-height:1.2}.metric span{color:var(--muted)}.notice{padding:15px 20px;border-left:4px solid #c89725;background:#fff8e8;margin:18px 0}.success{border-color:var(--accent);background:#edf9f5}.muted{color:var(--muted)}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin:15px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line);vertical-align:top}th{background:#f1f6f7}.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap}.pass{background:#dcf5e9;color:#086744}.skip{background:#fff0c7;color:#78530b}.fail{background:#ffe3e3;color:#9c2020}.toolbar{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}input,select,button{font:inherit;padding:10px 13px;border:1px solid #b4c8cf;border-radius:6px;background:white;color:var(--ink)}input{flex:1;min-width:220px}button{cursor:pointer}button:hover{background:#e5f4ef}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #168e8b;outline-offset:3px}details{border:1px solid var(--line);border-radius:7px;margin:8px 0}summary{cursor:pointer;padding:13px;display:flex;align-items:center;gap:13px;list-style:none}summary::before{content:'+';color:var(--accent);font-size:20px}details[open]>summary::before{content:'−'}summary:hover{background:#f4f9fa}.test-title{flex:1;min-width:0}.test-title small{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.test-number{font-size:12px;color:var(--muted)}.duration{font-size:12px;min-width:64px;text-align:right}.detail-body{padding:0 18px 18px}.file-card summary{justify-content:space-between;overflow-wrap:anywhere}.file-card summary span{flex:1;font-family:ui-monospace,Consolas,monospace;font-size:13px}.file-card small{white-space:nowrap;color:var(--muted)}pre{background:#112c34;color:#deebed;padding:18px;border-radius:6px;overflow:auto;font:12px/1.65 ui-monospace,Consolas,monospace;max-height:550px;tab-size:2}code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;overflow-wrap:anywhere}.diff .add{color:#9ae6ac}.diff .del{color:#ffb2b2}.diff .hunk{color:#8fdbff}.hash{font-size:11px;overflow-wrap:anywhere}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;border:1px solid var(--line);padding:12px;border-radius:8px}figcaption{font-weight:700;margin-bottom:10px}img{width:100%;height:330px;object-fit:contain;object-position:top;background:#f2f3f1}.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:#e0e9ec;margin:20px 0}.bar span:first-child{background:#078779;width:99.53%}.bar span:last-child{background:#e6b545;flex:1}footer{padding:20px;text-align:center;color:var(--muted)}[hidden]{display:none!important}@media(max-width:700px){main{padding:12px}section{padding:18px}.metrics{grid-template-columns:repeat(2,1fr)}.gallery{grid-template-columns:1fr}.test-number,.duration{display:none}summary{gap:8px}.file-card summary{flex-wrap:wrap}.file-card small{width:100%}nav{gap:16px;font-size:13px}}@media print{nav,.toolbar,button{display:none}header{background:#fff;color:#172d36;padding:20px}.subtitle,.meta,.eyebrow{color:#516771}main{max-width:none;padding:0}section,.metric{break-inside:avoid;border-radius:0}pre{white-space:pre-wrap;max-height:none;background:#f3f5f6;color:#172d36;font-size:9px}details{break-inside:avoid}.diff .add{color:#086744}.diff .del{color:#9c2020}img{height:auto;max-height:400px}}
'''
css += 'details:not([open]) > :not(summary){display:none}.detail-body{min-width:0;max-width:100%}summary{min-width:0}.file-card summary span{min-width:0}section{overflow:clip}pre,.table-wrap{max-width:100%}'
script = '''
const query = document.querySelector('#test-search'), lane = document.querySelector('#lane'), status = document.querySelector('#status');
function filterTests(){let visible=0;document.querySelectorAll('.test-card').forEach(card=>{card.hidden=!(card.dataset.search.toLowerCase().includes(query.value.toLowerCase())&&(!lane.value||card.dataset.lane===lane.value)&&(!status.value||card.dataset.status===status.value));if(!card.hidden)visible++;});document.querySelector('#test-count').textContent=visible+' of 213 test executions shown';}
[query,lane,status].forEach(input=>input.addEventListener('input',filterTests));
document.querySelector('#file-search').addEventListener('input',event=>{let visible=0;document.querySelectorAll('.file-card').forEach(card=>{card.hidden=!card.dataset.search.toLowerCase().includes(event.target.value.toLowerCase());if(!card.hidden)visible++;});document.querySelector('#file-count').textContent=visible+' files shown';});
document.querySelectorAll('[data-expand]').forEach(button=>button.addEventListener('click',()=>document.querySelectorAll(button.dataset.expand).forEach(card=>{if(!card.hidden)card.open=true;})));
document.querySelectorAll('[data-collapse]').forEach(button=>button.addEventListener('click',()=>document.querySelectorAll(button.dataset.collapse).forEach(card=>card.open=false)));
document.querySelector('#print').addEventListener('click',()=>window.print());
'''
output = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="DevDocs AI test results and complete working-tree change report"><title>DevDocs AI — Test & Change Report</title><style>{css}</style></head><body>
<header><div class="eyebrow">Engineering verification · 27 September 2026</div><h1>DevDocs AI<br>Test &amp; Change Report</h1><p class="subtitle">A complete ledger of the recorded test executions, application fixes, framework improvements, dependency updates and remaining validation work from this testing run.</p><div class="meta">Generated {esc(generated)} · Baseline HEAD {esc(commit[:12])} · Portable HTML / no external assets</div></header>
<nav aria-label="Report sections"><a href="#overview">Overview</a><a href="#findings">Findings &amp; scope</a><a href="#tests">All tests</a><a href="#changes">All changes</a><a href="#screenshots">Screenshots</a><a href="#evidence">Evidence</a></nav>
<main><div class="metrics"><div class="metric"><strong>212</strong><span>passed test executions</span></div><div class="metric"><strong>1</strong><span>intentional desktop skip</span></div><div class="metric"><strong>0</strong><span>final test failures</span></div><div class="metric"><strong>{len(files)}</strong><span>files with complete diffs</span></div></div>
<section id="overview"><h2>Verification summary</h2><div class="bar" role="img" aria-label="212 passed and 1 skipped test execution"><span></span><span></span></div><div class="table-wrap"><table><thead><tr><th>Check</th><th>Result</th><th>Evidence / scope</th></tr></thead><tbody>
<tr><td>Desktop + Pixel 7 browser suite</td><td>{badge('passed')} 125 / 126; 1 skipped</td><td>63 unique scenarios × 2 projects; 21.7 minutes; no retries or flaky results. Stateful API and development-only Clerk doubles.</td></tr>
<tr><td>Isolated unit suite</td><td>{badge('passed')} 62 / 62</td><td>Crypto, rate limits, four provider adapters, API streaming and actual browser SSE parser. Refreshed as JSON for this report.</td></tr>
<tr><td>PostgreSQL integration</td><td>{badge('passed')} 25 / 25</td><td>Temporary PostgreSQL 15.18, committed migrations, real writes/encryption; provider verification mocked.</td></tr>
<tr><td>API production build + startup smoke</td><td>{badge('passed')}</td><td>Recorded successful command exits in this session; health, metrics and unauthenticated API boundaries.</td></tr>
<tr><td>Web production build + authentication smoke</td><td>{badge('passed')}</td><td>Recorded successful command exits; homepage/security headers, protected routes, spoofed headers, no mock identity in browser chunks.</td></tr>
<tr><td>TypeScript / lint / diff formatting</td><td>{badge('passed')}</td><td>All 3 packages typecheck; frontend lint; git diff --check. Recorded command outcomes.</td></tr>
<tr><td>Production dependency audit</td><td>{badge('passed')} 0 findings</td><td>441 production dependencies at audit time. Development dependencies were outside this audit.</td></tr>
<tr><td>Live Clerk and paid provider E2E</td><td><span class="badge skip">not executed</span></td><td>Requires a dedicated staging account/session and authorized provider spend.</td></tr>
</tbody></table></div><div class="notice">This is feature and boundary coverage, not measured 100% line/branch coverage or a guarantee of zero production errors. Desktop and mobile results are Chromium-based. Review the remaining validation section before release.</div>
<p><strong>Sequence:</strong> full browser suite passed first; the long-history request regression was then added and fixed, verified by unit tests, typechecking and the production build. The complete browser suite was not repeated after that serialization-only change. The HTML-report request reran only the isolated unit lane to capture individual machine-readable results.</p><button id="print" type="button">Print / save as PDF</button><p class="muted">Print includes currently expanded details. Use the section controls to expand the evidence you want before printing.</p></section>
<section id="findings"><h2>Findings, fixes and remaining validation</h2>{markdown(read('docs/TESTING_REPORT.md'))}<h3>Earlier failures resolved during the run</h3><ul><li>Desktop/mobile selector ambiguity: narrowed interactions to enabled controls and the active document dialog.</li><li>Homepage overflow: responsive grid and navigation styles corrected the actual layout defect.</li><li>Long conversation context: a new failing unit regression proved the request exceeded the shared schema limit; bounding outbound context resolved it.</li><li>Production smoke hostname mismatch: using localhost consistently resolved Clerk internal rewrite proxy failure.</li><li>Compiled API startup: the esbuild output resolved runtime module loading errors.</li><li>Dependency audit: initial findings drove patched direct/transitive upgrades; the final production audit reported zero.</li></ul><p>Final results supersede exploratory failures. Earlier partial browser artifacts do not constitute additional unique passing coverage.</p></section>
<section id="tests"><h2>Complete test ledger</h2><p>Each row is one recorded test execution. Open a row for result metadata and, where captured, embedded browser network/console/procedure evidence. Expected HTTP failures in recovery tests are deliberate inputs, not failing test outcomes.</p><div class="toolbar"><input id="test-search" type="search" aria-label="Search tests" placeholder="Search test name, file, provider or feature"><select id="lane" aria-label="Test lane"><option value="">All lanes</option><option>Browser</option><option>Unit</option><option>PostgreSQL</option></select><select id="status" aria-label="Test status"><option value="">All statuses</option><option value="passed">Passed</option><option value="skipped">Skipped</option></select><button data-expand=".test-card" type="button">Expand visible</button><button data-collapse=".test-card" type="button">Collapse</button></div><p id="test-count" aria-live="polite" class="muted">213 of 213 test executions shown</p>{''.join(test_cards)}<h3>Existing test files outside the final executed lanes</h3><div class="table-wrap"><table><thead><tr><th>File</th><th>Execution status</th></tr></thead><tbody>{''.join(not_run)}</tbody></table></div></section>
<section id="changes"><h2>Complete change ledger</h2><p>{len(files)} files · {len([f for f in files if f in untracked])} new · {len([f for f in files if f not in untracked])} modified · +{additions:,} / −{deletions:,} lines. Every entry contains its explanation, current-file SHA-256 and full patch. New files are shown in full as additions, including the report generator.</p><div class="notice">Change evidence is the current working tree against HEAD <code>{esc(commit)}</code>. No start-of-run Git snapshot exists, so Git alone cannot prove the timing/authorship of each line; this inventory is reconciled with the session's changes. The pre-existing <code>.claude/settings.local.json</code> is excluded. The generated HTML itself is listed as this report's output and omitted from its own diff to avoid recursive embedding. No commit or deployment was performed.</div><div class="toolbar"><input id="file-search" type="search" aria-label="Search changed files" placeholder="Search path or change explanation"><button data-expand=".file-card" type="button">Expand visible diffs</button><button data-collapse=".file-card" type="button">Collapse</button></div><p id="file-count" aria-live="polite" class="muted">{len(files)} files shown</p>{''.join(file_cards)}<p><strong>Additional output:</strong> <code>docs/TESTING_REPORT.html</code> — this self-contained report, generated during the report request. JSON test results, screenshots, traces and build outputs are ignored artifacts, not committed source changes. A temporary embedded PostgreSQL installation was used outside the repository and its server was stopped after integration testing.</p></section>
<section id="screenshots"><h2>Desktop and mobile screenshot evidence</h2><p>Ten screenshots from the final browser suite, embedded in this file. These support layout review; no pixel baseline comparisons or formal accessibility certification were performed. Select an image to download the original PNG.</p><div class="gallery">{''.join(screenshots)}</div></section>
<section id="evidence"><h2>Evidence and reproducibility</h2><p>Test names, statuses and durations come directly from runner JSON. Build, smoke, lint and typecheck outcomes are recorded session command results summarized in the Markdown report; separate raw logs for all those commands were not retained. Source changes are extracted directly from Git. All displayed source and artifact text is HTML-escaped.</p><div class="table-wrap"><table><thead><tr><th>Source artifact</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>{''.join(evidence_rows)}</tbody></table></div><details><summary>Production dependency audit — complete JSON</summary><pre>{pretty_json(audit)}</pre></details><details><summary>Browser runner statistics</summary><pre>{pretty_json(browser['stats'])}</pre></details><details><summary>Unit and integration run metadata</summary><pre>{pretty_json({name: {k: value.get(k) for k in ['startTime','success','numTotalTests','numPassedTests','numFailedTests','numPendingTests']} for name,value in [('unit',unit),('integration',integration)]})}</pre></details><h3>Regenerate this report</h3><pre>python scripts/generate_testing_report.py</pre><p>The generator requires the existing JSON artifacts and screenshots from this run. It does not execute tests or contact external services. The HTML can be copied and opened independently; its CSS, search controls, screenshots, test evidence and source diffs are embedded. Raw Playwright traces/videos remain in the local Playwright artifact directories where available.</p><p>Source report: <code>docs/TESTING_REPORT.md</code><br>Playwright interactive report: <code>apps/web/playwright-report/index.html</code><br>Full runner artifacts: <code>apps/web/test-results/</code> and <code>test-results/</code></p></section>
</main><footer>DevDocs AI · Final executed lanes: 212 passed / 1 intentional skip · Live-service validation remains outstanding.</footer><script>{script}</script></body></html>'''
output = output.replace('<section id="tests">', refresh_section + live_section + '<section id="tests">', 1)
final_summary_file = ROOT / '.freebuff/live-testing/20260930-173121/final-verification-summary.json'
if final_summary_file.is_file():
    final_summary = json.loads(final_summary_file.read_text(encoding='utf-8-sig'))
    resolution = json_file('test-results/deterministic-resolution.json')
    deterministic_passes = resolution['finalStatuses']['passed']
    unit_passes = final_summary['commands']['isolatedUnitTests']['passed']
    feature_passes = final_summary['liveFeaturePasses']
    current_metrics = f'<div class="metrics"><div class="metric"><strong>{deterministic_passes}</strong><span>resolved deterministic passes</span></div><div class="metric"><strong>{unit_passes}</strong><span>current isolated unit passes</span></div><div class="metric"><strong>{feature_passes}</strong><span>current real-service feature passes</span></div><div class="metric"><strong>10</strong><span>saved live SaaS domains</span></div></div>'
    output = re.sub(r'<div class="metrics">.*?</div></div>', lambda _: current_metrics, output, count=1)
    current_overview = f'<section id="current-overview"><h2>Current completion — September 30</h2><p>Steps 1–3 completed. Full real Clerk/API/PostgreSQL/Meta Muse SaaS interview, ten document edits and reload, parsed Markdown/ZIP, and desktop/mobile library checks passed. The unsaved-draft export defect was fixed and verified.</p><p>{deterministic_passes} resolved deterministic passes and one intentional skip combine the complete initial suite with focused reruns; they use doubles. {unit_passes} isolated unit tests passed. Current real-service results contain {feature_passes} feature executions plus four authentication setup executions. Fresh builds, typecheck, lint and production smoke passed.</p><p>Retained live project: <code>{esc(final_summary["projectId"])}</code>. New spending reservations: $3.19284750; cumulative including prior work: $4.96119375. Exact billed spend is unverified. Frontend/API remain on ports 3000/4000. No commit or deployment.</p><p>The original September 27 ledger below remains historical evidence and is excluded from these current totals.</p></section>'
    output = output.replace('<section id="overview">', current_overview + '<section id="overview">', 1)
    output = output.replace('<a href="#overview">Overview</a>', '<a href="#current-overview">Current overview</a><a href="#overview">Historical overview</a>')
output = output.replace('Engineering verification · 27 September 2026', 'Engineering verification · 27 and 30 September 2026')
output = output.replace('<a href="#tests">All tests</a>', '<a href="#live">Live results</a><a href="#tests">Historical tests</a>')
output = output.replace('<a href="#live">Live results</a>', '<a href="#refresh">Current regression</a><a href="#live">Live results</a>')
output = output.replace('<span>passed test executions</span>', '<span>historical passed executions</span>')
output = output.replace('<span>final test failures</span>', '<span>historical final failures</span>')
output = output.replace('Final executed lanes: 212 passed / 1 intentional skip', 'Historical ledger: 212 passed / 1 intentional skip')
output = output.replace('<h2>Verification summary</h2>', '<h2>Historical verification summary — September 27</h2>')
output = output.replace('Ten screenshots from the final browser suite, embedded in this file.', 'Historical desktop/mobile layouts and current live interview, saved-edit and library screenshots are embedded in this file.')
output = output.replace('Live-service validation remains outstanding.', 'See the live results and remaining validation sections.')
if consolidated_section:
    output = output.replace('Engineering verification · 27 and 30 September 2026', 'Engineering verification · 1 October 2026; historical September evidence retained')
    output = output.replace('separate raw logs for all those commands were not retained.', 'the latest continuation retains raw typecheck, lint, build and smoke logs in its timestamped archive. Some historical commands lack separate raw logs.')
    output = output.replace('<section id="current-overview">', consolidated_section + '<section id="current-overview">', 1)
    output = output.replace('<a href="#current-overview">Current overview</a>', '<a href="#consolidated">Final browser run</a><a href="#current-overview">Earlier live overview</a>')
    output = output.replace('resolved deterministic passes</span>', 'consolidated deterministic passes</span>')
    output = output.replace('current isolated unit passes</span>', 'previously verified isolated unit passes</span>')
    output = output.replace('current real-service feature passes</span>', 'earlier real-service feature passes</span>')
    output = output.replace('Current completion — September 30', 'Earlier live completion — September 30')
    output = output.replace('141 resolved deterministic passes and one intentional skip combine the complete initial suite with focused reruns; they use doubles.', 'The earlier resolved deterministic outcomes combined an initial suite with focused reruns. The consolidated execution above supersedes that union for current browser acceptance.')
output = output.replace('<tr><td>Live Clerk and paid provider E2E</td><td><span class="badge skip">not executed</span></td><td>Requires a dedicated staging account/session and authorized provider spend.</td></tr>', '<tr><td>Live Clerk and provider E2E</td><td>See live results</td><td>Separate September 30 executions; excluded from these historical totals.</td></tr>')
auth_manifest = ROOT / 'test-results/auth-runs.json'
if auth_manifest.is_file():
    auth = json_file(json.loads(auth_manifest.read_text(encoding='utf-8-sig'))['summary'])
    auth_rows = ''.join('<tr><td>' + esc(s['scenario']) + '</td><td>' + badge(s['status']) + '</td><td>' + esc(s['evidence']) + '</td></tr>' for s in auth['scenarios'])
    attempts = ''.join('<tr><td>' + esc(a['name']) + '</td><td>' + esc(c['name']) + '</td><td>' + badge(c['runnerStatus']) + '</td></tr>'
                       for a in auth['attempts'] for c in a['cases'])
    auth_section = '<section id="auth-live"><h2>Targeted real Clerk authentication — October 1</h2><p>Real Clerk/API/application PostgreSQL. Restoration, natural short-token renewal and sign-out/recovery have real evidence. Full session expiration, explicit backend revocation, two-account ownership and deletion remain blocked. No product defect was confirmed; no paid provider request, commit or deployment occurred.</p><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Actual result</th><th>Evidence or blocker</th></tr></thead><tbody>' + auth_rows + '</tbody></table></div><details><summary>Actual runner attempts, including retained failures and skips</summary><div class="table-wrap"><table><thead><tr><th>Attempt</th><th>Case</th><th>Runner status</th></tr></thead><tbody>' + attempts + '</tbody></table></div><p>Interrupted attempts may lack runner JSON; their available artifacts are retained. Recorded sign-out boundary assertions passed before the human-pause timeout. Recovery passed separately.</p></details><details><summary>Sanitized renewal, recovery and database evidence</summary><pre>' + pretty_json({'renewal': auth['renewal'], 'recovery': auth['recovery'], 'database': auth['database'], 'spending': auth['spending'], 'retained': auth['retained'], 'servers': auth['servers']}) + '</pre></details><p>Archive: <code>' + esc(auth['artifactDirectory']) + '</code>. Raw traces, videos and browser storage stay local.</p></section>'
    output = output.replace('<main>', '<main>' + auth_section, 1)
    output = output.replace('<a href="#findings">', '<a href="#auth-live">Real auth checks</a><a href="#findings">', 1)
provider_pointer = ROOT / '.freebuff/current-provider-fix.txt'
if provider_pointer.is_file():
    provider_archive = Path(provider_pointer.read_text(encoding='utf-8-sig').strip())
    provider_summary = provider_archive / 'provider-fix-summary.json'
    if (ROOT / provider_summary).is_file():
        provider = json_file(provider_summary)
        provider_section = '<section id="provider-current"><h2>Current live Meta generation — blocked</h2><p>The requested <code>muse-spark-1.3-contributor</code> request returned 404 <code>model_not_found</code>. The configured key catalog lists only an image model. Historical passing tests do not establish current text-model access. The model configuration and error handling have been updated; a successful live generation remains blocked pending Meta access.</p><p>83 isolated unit checks and two focused simulated desktop/mobile checks passed. Simulated recovery is not live provider completion. See the findings and evidence for retained initial selector failures, current server status and spending reservations.</p><details><summary>Current provider diagnosis and spending evidence</summary><pre>' + pretty_json(provider) + '</pre></details></section>'
        output = output.replace('<main>', '<main>' + provider_section, 1)
        output = output.replace('<a href="#findings">', '<a href="#provider-current">Current provider blocker</a><a href="#findings">', 1)
        output = output.replace('Engineering verification · 1 October 2026; historical September evidence retained', 'Engineering verification · 4 October 2026; historical evidence retained')
OUTPUT.write_text(output, encoding='utf-8')
print(json.dumps({'output': str(OUTPUT), 'bytes': OUTPUT.stat().st_size, 'tests': len(rows), 'statuses': dict(counts), 'changedFiles': len(files), 'screenshots': len(screenshots), 'excludedPreexisting': excluded}, indent=2))
