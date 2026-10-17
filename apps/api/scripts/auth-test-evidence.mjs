// Live auth evidence only. No integration setup, provider calls, or SQL writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import postgres from 'postgres';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const run = fs.readFileSync(path.join(root, '.freebuff/auth-testing/current-run.txt'), 'utf8').trim();
const env = parse(fs.readFileSync(path.join(root, 'apps/api/.env')));
const web = parse(fs.readFileSync(path.join(root, 'apps/web/.env.local')));
Object.assign(process.env, { CLERK_SECRET_KEY: env.CLERK_SECRET_KEY });
const { clerkClient } = await import('@clerk/express');
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
const tables = ['users', 'projects', 'documentation_bundles', 'user_api_keys', 'interview_sessions', 'interview_messages'];
async function snapshot() {
  const result = {};
  for (const table of tables) result[table] = await sql`select id, md5(row_to_json(t)::text) hash from ${sql(table)} t order by id`;
  return result;
}
try {
  const [mode, value] = process.argv.slice(2);
  if (mode === 'baseline') {
    const records = await snapshot();
    fs.writeFileSync(path.join(run, 'database-baseline.json'), JSON.stringify(records, null, 2));
    const config = { webClerkConfigured: !!web.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, apiClerkConfigured: !!env.CLERK_SECRET_KEY,
      clerkSecretsMatch: !!env.CLERK_SECRET_KEY && env.CLERK_SECRET_KEY === web.CLERK_SECRET_KEY,
      applicationDatabaseConfigured: !!env.DATABASE_URL, webUrlMatches: env.WEB_URL === 'http://localhost:3000',
      capturedAt: new Date().toISOString(), counts: Object.fromEntries(tables.map(t => [t, records[t].length])) };
    fs.writeFileSync(path.join(run, 'configuration.json'), JSON.stringify(config, null, 2));
    console.log(JSON.stringify(config));
  } else if (mode === 'identity') {
    const user = await clerkClient.users.getUser(value);
    const local = await sql`select id from users where clerk_id = ${value}`;
    console.log(JSON.stringify({ clerkId: user.id, createdAt: user.createdAt, localId: local[0]?.id ?? null }));
  } else if (mode === 'revoke') {
    const session = await clerkClient.sessions.getSession(value);
    const user = await clerkClient.users.getUser(session.userId);
    const record = JSON.parse(fs.readFileSync(path.join(run, 'accounts.json')));
    if (!Object.values(record).some(a => a.clerkId === user.id && a.createdAt >= Date.parse(record.startedAt))) throw new Error('Dedicated run account required');
    const revoked = await clerkClient.sessions.revokeSession(value);
    console.log(JSON.stringify({ status: revoked.status, revokedAt: new Date().toISOString(), mechanism: 'Clerk Backend API sessions.revokeSession' }));
  } else if (mode === 'session' || mode === 'saved-session') {
    let sessionId = value;
    if (mode === 'saved-session') {
      const state = JSON.parse(fs.readFileSync(path.join(run, 'saved-original-copy.json')));
      const jwt = state.cookies.find(cookie => cookie.name === '__session')?.value;
      sessionId = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).sid;
    }
    const session = await clerkClient.sessions.getSession(sessionId);
    console.log(JSON.stringify({ status: session.status, expireAt: session.expireAt, abandonAt: session.abandonAt }));
  } else if (mode === 'snapshot') {
    const current = await snapshot();
    const before = JSON.parse(fs.readFileSync(path.join(run, 'database-baseline.json')));
    const unchanged = Object.fromEntries(tables.map(t => [t, before[t].every(row => current[t].some(r => r.id === row.id && r.hash === row.hash))]));
    const record = JSON.parse(fs.readFileSync(path.join(run, 'accounts.json')));
    const owned = {};
    for (const label of ['A', 'B']) {
      const account = record[label];
      if (!account) continue;
      const user = await sql`select id from users where clerk_id = ${account.clerkId}`;
      const project = await sql`select id, user_id, name, status, deleted_at, md5(row_to_json(p)::text) hash from projects p where user_id = ${account.localId}`;
      const documents = await sql`select d.id, d.project_id, d.domain_id, md5(row_to_json(d)::text) hash from documentation_bundles d join projects p on p.id = d.project_id where p.user_id = ${account.localId}`;
      const sessions = await sql`select id from interview_sessions where user_id = ${account.localId}`;
      const messages = await sql`select m.id from interview_messages m join interview_sessions s on s.id = m.session_id where s.user_id = ${account.localId}`;
      const keys = await sql`select id from user_api_keys where user_id = ${account.localId}`;
      owned[label] = { user, projects: project, documents, sessions, messages, keys };
    }
    const result = { at: new Date().toISOString(), preexistingUnchanged: unchanged, owned, counts: Object.fromEntries(tables.map(t => [t, current[t].length])) };
    if (value) fs.writeFileSync(path.join(run, value + '.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } else throw new Error('Unknown evidence operation');
} catch (error) {
  console.error(JSON.stringify({ errorType: error.name, errorCode: error.code ?? error.status ?? null }));
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
