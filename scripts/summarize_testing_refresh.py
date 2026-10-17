"""Resolve deterministic outcomes across the complete run and focused reruns."""
import json
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'test-results/refresh-runs.json').read_text(encoding='utf-8-sig'))
latest = {}

def walk(suites, run):
    for suite in suites:
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                attempts = test.get('results', [])
                if not attempts:
                    continue
                file = spec.get('file', suite.get('file', '')).replace('\\', '/')
                key = (file, spec['title'], test.get('projectName', ''))
                latest[key] = dict(file=file, title=spec['title'], project=key[2],
                                   status=attempts[-1]['status'], latestRun=run)
        walk(suite.get('suites', []), run)

for run in manifest['runs']:
    report = json.loads((root / run['report']).read_text(encoding='utf-8-sig'))
    if 'stats' in report:
        walk(report.get('suites', []), run['name'])

summary = dict(scope='Deterministic doubles only; desktop Chromium and Pixel 7 emulation',
               uniqueCases=len(latest), finalStatuses=dict(Counter(row['status'] for row in latest.values())),
               cases=list(latest.values()))
output = root / 'test-results/deterministic-resolution.json'
output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({key: value for key, value in summary.items() if key != 'cases'}))
