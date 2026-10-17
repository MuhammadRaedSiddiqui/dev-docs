// Read-only checks for the configured live lane. Never prints credential values.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const api = parse(fs.readFileSync(path.join(root, 'apps/api/.env')));
const web = parse(fs.readFileSync(path.join(root, 'apps/web/.env.local')));
const liveFile = path.join(root, 'apps/web/e2e/.env');
const live = fs.existsSync(liveFile) ? parse(fs.readFileSync(liveFile)) : {};
const present = value => Boolean(value && !/your[_-]|placeholder/i.test(value));
const summary = {
  credentials: {
    database: present(api.DATABASE_URL),
    apiClerkSecret: present(api.CLERK_SECRET_KEY),
    apiClerkPublishable: present(api.CLERK_PUBLISHABLE_KEY),
    webClerkSecret: present(web.CLERK_SECRET_KEY),
    webClerkPublishable: present(web.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    publishableKeysMatch: api.CLERK_PUBLISHABLE_KEY ? api.CLERK_PUBLISHABLE_KEY === web.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY : null,
    secretKeysMatch: api.CLERK_SECRET_KEY === web.CLERK_SECRET_KEY,
    encryptionKeyValid: /^[a-f\d]{64}$/i.test(api.ENCRYPTION_KEY ?? ''),
    aiTriageEnabled: live.ENABLE_AI_TRIAGE === 'true' || process.env.ENABLE_AI_TRIAGE === 'true',
  },
  routing: {
    webUsesLocalApi: web.NEXT_PUBLIC_API_URL === 'http://localhost:4000',
    apiAcceptsLocalWeb: api.WEB_URL === 'http://localhost:3000',
    liveUsesLocalWeb: !live.BASE_URL || live.BASE_URL === 'http://localhost:3000',
  },
};
try {
  const pk = web.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const host = Buffer.from(pk.replace(/^pk_(test|live)_/, ''), 'base64').toString().replace(/\$$/, '');
  if (!/^[a-z\d.-]+$/i.test(host)) throw new Error('invalid publishable key');
  const responses = await Promise.all([
    fetch('https://api.clerk.com/v1/jwks', { headers: { Authorization: `Bearer ${api.CLERK_SECRET_KEY}` }, signal: AbortSignal.timeout(15000) }),
    fetch(`https://${host}/.well-known/jwks.json`, { signal: AbortSignal.timeout(15000) }),
  ]);
  summary.clerk = { secretAccepted: responses[0].ok, frontendReachable: responses[1].ok };
  if (responses.every(r => r.ok)) {
    const [backend, frontend] = await Promise.all(responses.map(r => r.json()));
    summary.clerk.instanceMatches = backend.keys?.some(a => frontend.keys?.some(b => a.kid === b.kid && a.n === b.n && a.e === b.e)) ?? false;
  }
} catch (error) {
  summary.clerk = { checkFailed: true, errorType: error.name, errorCode: error.cause?.code };
}
const sql = postgres(api.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
try {
  await sql`select 1`;
  const columns = await sql`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and table_name in ('users','projects','documentation_bundles','user_api_keys','interview_sessions','interview_messages') order by table_name, ordinal_position`;
  const counts = await sql`select (select count(*)::int from users) users, (select count(*)::int from users where clerk_id is not null) linked_users, (select count(*)::int from projects) projects, (select count(*)::int from documentation_bundles) documents, (select count(*)::int from user_api_keys) provider_keys, (select count(*)::int from interview_sessions) sessions, (select count(*)::int from interview_messages) messages`;
  summary.database = { connected: true, columns, counts: counts[0] };
  const migrationTable = await sql`select to_regclass('drizzle.__drizzle_migrations')::text name`;
  summary.database.migrations = migrationTable[0].name
    ? await sql`select id, created_at from drizzle.__drizzle_migrations order by id`
    : [];
  const stateFile = path.join(root, 'apps/web/e2e/storage-state/user.json');
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const sessionCookie = state.cookies?.find(c => c.name === '__session' && c.value);
    if (sessionCookie) {
      // Only resolve the identity already authenticated by the browser/API.
      // Decoding this claim is diagnostic; it is not token verification.
      const claims = JSON.parse(Buffer.from(sessionCookie.value.split('.')[1], 'base64url').toString());
      const identity = await sql`select id from users where clerk_id = ${claims.sub}`;
      if (identity.length) {
        const projects = await sql`select count(*)::int count from projects where user_id = ${identity[0].id} and deleted_at is null`;
        const keys = await sql`select provider from user_api_keys where user_id = ${identity[0].id}`;
        summary.database.browserIdentity = { mapped: true, activeProjects: projects[0].count, configuredProviders: keys.map(k => k.provider) };
      } else summary.database.browserIdentity = { mapped: false };
    }
  }
  let projectId = process.argv[3];
  if (projectId === 'latest-live') {
    const latest = await sql`select id from projects where name like 'E2E Interview %' order by created_at desc limit 1`;
    projectId = latest[0]?.id;
  }
  const reportFile = path.join(root, 'apps/web/test-results/results.json');
  if (!projectId && fs.existsSync(reportFile)) {
    const findProject = suites => {
      for (const suite of suites ?? []) {
        for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) for (const attachment of result.attachments ?? []) {
            if (attachment.name !== 'live-project') continue;
            const body = attachment.path ? fs.readFileSync(attachment.path, 'utf8') : Buffer.from(attachment.body, 'base64').toString();
            return JSON.parse(body).projectId;
          }
        }
        const nested = findProject(suite.suites);
        if (nested) return nested;
      }
    };
    projectId = findProject(JSON.parse(fs.readFileSync(reportFile)).suites);
  }
  if (projectId && /^[a-f\d-]{36}$/i.test(projectId)) {
    const project = await sql`select id, type, status, interview_data->'completedDomains' completed_domains, interview_data->>'currentDomain' current_domain from projects where id = ${projectId}`;
    const documents = await sql`select domain_id, length(content)::int content_chars from documentation_bundles where project_id = ${projectId} order by domain_id`;
    const sessions = await sql`select total_messages, total_domains_completed, is_complete, primary_provider from interview_sessions where project_id = ${projectId}`;
    const messages = await sql`select m.role, m.domain_id, m.provider, m.error_type, count(*)::int count from interview_messages m join interview_sessions s on m.session_id = s.id where s.project_id = ${projectId} group by m.role, m.domain_id, m.provider, m.error_type order by m.domain_id, m.role`;
    summary.database.liveProject = { project: project[0] ?? null, documents, sessions, messages };
  }
} catch (error) {
  summary.database = { connected: false, errorType: error.name, errorCode: error.code };
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
const { columns, ...database } = summary.database ?? {};
console.log(JSON.stringify({ ...summary, database: { ...database, columnCount: columns?.length } }, null, 2));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(summary, null, 2));
