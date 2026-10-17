import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Intentionally isolated credentials: this check must never use a real database.
const child = spawn(process.execPath, ['dist/hono-server.cjs'], {
  env: { ...process.env, PORT: '0', NODE_ENV: 'production', DATABASE_URL: 'postgresql://test:test@127.0.0.1:9/devdocs_test', WEB_URL: 'http://localhost:3000', SENTRY_DSN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
try {
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`API startup timed out: ${output}`)), 60_000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/running at http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`API exited with ${code}: ${output}`)); });
    child.once('error', reject);
  });
  const base = `http://localhost:${port}`;
  for (const path of ['/health', '/health/live']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'));
  }
  assert.equal((await fetch(base + '/trpc/projects.list')).status, 401);
  assert.equal((await fetch(base + '/ai/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(base + '/projects')).status, 404);
  assert.match(await (await fetch(base + '/metrics')).text(), /devdocs/);
  console.log('PASS: compiled API starts, health/metrics respond, and application endpoints require authentication.');
} finally { child.kill(); }
