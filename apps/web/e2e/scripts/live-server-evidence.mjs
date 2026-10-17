// Public boundaries only: never prints redirect URLs, response bodies or headers.
import fs from 'node:fs';
const checks = [];
for (const [service, base, endpoint, init] of [
  ['api', 'http://localhost:4000', '/health/ready', {}],
  ['api', 'http://localhost:4000', '/trpc/projects.list', {}],
  ['api', 'http://localhost:4000', '/ai/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
  ['web', 'http://localhost:3000', '/dashboard', {}],
  ['web', 'http://localhost:3000', '/dashboard', { headers: { 'x-playwright': '1' } }],
]) {
  const check = { service, endpoint, spoofedTestHeader: !!init.headers?.['x-playwright'], status: null };
  try {
    const response = await fetch(base + endpoint, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    check.status = response.status;
    await response.body?.cancel();
  } catch (error) {
    check.errorType = error.name;
    check.errorCode = error.cause?.code ?? null;
  }
  checks.push(check);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ at: new Date().toISOString(), checks }, null, 2));
  console.log(JSON.stringify(check));
}
const evidence = { at: new Date().toISOString(), checks };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
if (checks[0].status !== 200 || checks[1].status !== 401 || checks[2].status !== 401 || checks.slice(3).some(c => ![302, 303, 307, 308, 401, 403, 404].includes(c.status))) {
  throw new Error('Real service boundary preflight failed');
}
