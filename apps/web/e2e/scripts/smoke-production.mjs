import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function checkProductionChunks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await checkProductionChunks(file);
    else if (entry.name.endsWith('.js')) assert.doesNotMatch(await readFile(file, 'utf8'), /e2e-mocked-session|Mock sign-in boundary/, `Mock identity must not ship in ${file}`);
  }
}
await checkProductionChunks('.next/static/chunks');

const require = createRequire(import.meta.url);
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
// No real account, database or provider requests. PLAYWRIGHT=1 deliberately
// probes that production refuses the development mock-auth switch.
// Keep the request and listening hostname identical: Clerk rewrites public
// requests internally, and mixed loopback hostnames trigger an external proxy.
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', PLAYWRIGHT: '1', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk', CLERK_SECRET_KEY: 'sk_test_isolated_smoke_placeholder' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let output = '';
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Web startup timed out: ${output}`)), 60_000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (/Ready in/.test(output)) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Web exited with ${code}: ${output}`)); });
  });
  const base = `http://localhost:${port}`;
  console.log('Checking production homepage');
  const home = await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  assert.equal(home.status, 200, 'Public homepage is available');
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  assert.doesNotMatch(await home.text(), /data-e2e-hydrated|fake-session/);
  for (const path of ['/dashboard', '/settings', '/docs', '/templates', '/project/00000000-0000-4000-a000-000000000001/interview']) {
    console.log(`Checking unauthenticated access: ${path}`);
    for (const headers of [{}, { 'x-playwright': '1' }, { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' }]) {
      const response = await fetch(base + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      assert.ok([301, 302, 303, 307, 308, 401, 403, 404].includes(response.status), `${path} rejects an unauthenticated request (${response.status})`);
      assert.doesNotMatch(await response.text(), /data-e2e-hydrated|fake-session/);
    }
  }
  console.log('PASS: no mock identity in production chunks; homepage/security headers and protected routes, including spoofed test and middleware headers.');
} catch (error) {
  console.error(output.replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+/g, '[redacted Clerk key]'));
  throw error;
} finally { child.kill(); }
