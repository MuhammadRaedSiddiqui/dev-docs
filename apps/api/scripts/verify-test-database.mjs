// Read-only test target verification. Never prints connection strings or passwords.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import postgres from 'postgres';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = process.argv[2];
let sql;
let result;
let configurationEvidence = {};
try {
  const env = parse(fs.readFileSync(path.join(root, 'apps/api/.env')));
  const testUrl = new URL(env.TEST_DATABASE_URL ?? '');
  const appUrl = new URL(env.DATABASE_URL ?? '');
  const databaseName = testUrl.pathname.split('/').filter(Boolean).at(-1) ?? '';
  const appDatabaseName = appUrl.pathname.split('/').filter(Boolean).at(-1) ?? '';
  configurationEvidence = { testUrlPresent: true, configuredDatabase: databaseName,
    nameGuardSatisfied: databaseName.toLowerCase().includes('_test'),
    applicationHostDifferent: testUrl.hostname !== appUrl.hostname,
    applicationDatabaseNameDifferent: databaseName !== appDatabaseName,
    supabaseDirectEndpoint: /^db\.[a-z0-9]+\.supabase\.co$/i.test(testUrl.hostname),
    hostPlaceholderDetected: /YOUR_TEST_HOST|YOUR_HOST|PROJECT.?REF|[<>]/i.test(testUrl.hostname),
    passwordPlaceholderDetected: /YOUR.?PASSWORD|YOUR_PASSWORD|<password>/i.test(decodeURIComponent(testUrl.password)) };
  if (!['postgres:', 'postgresql:'].includes(testUrl.protocol)) throw new Error('InvalidProtocol');
  if (!databaseName.toLowerCase().includes('_test')) throw new Error('GuardRejectedDatabaseName');
  if (testUrl.hostname === appUrl.hostname && databaseName === appDatabaseName) throw new Error('ApplicationDatabaseTargetRejected');
  if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== env.TEST_DATABASE_URL) throw new Error('ConflictingInheritedTestUrl');
  sql = postgres(env.TEST_DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10 });
  const evidence = await sql.begin('read only', async transaction => {
    const [identity] = await transaction`select current_database() database_name`;
    const tables = await transaction`select tablename from pg_tables where schemaname = 'public' order by tablename`;
    if (identity.database_name !== databaseName) throw new Error('ConnectedDatabaseNameMismatch');
    const counts = {};
    for (const name of ['users','projects','documentation_bundles','user_api_keys','interview_sessions','interview_messages']) {
      if (tables.some(t => t.tablename === name)) {
        const [row] = await transaction`select count(*)::int count from public.${transaction(name)}`;
        counts[name] = row.count;
      }
    }
    return { connectedDatabase: identity.database_name, publicTableNames: tables.map(t => t.tablename), applicationRowCounts: counts };
  });
  result = { at: new Date().toISOString(), verified: true, testUrlPresent: true,
    nameGuardSatisfied: true, applicationHostDifferent: testUrl.hostname !== appUrl.hostname,
    applicationDatabaseNameDifferent: databaseName !== appDatabaseName, ...evidence, readOnly: true };
} catch (error) {
  result = { at: new Date().toISOString(), verified: false, readOnly: true,
    ...configurationEvidence,
    errorType: error.name, errorCode: error.code ?? null,
    // Only explicit local validation labels; never print a driver error message.
    validation: ['InvalidProtocol','GuardRejectedDatabaseName','ApplicationDatabaseTargetRejected',
      'ConflictingInheritedTestUrl','ConnectedDatabaseNameMismatch'].includes(error.message) ? error.message : undefined };
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
