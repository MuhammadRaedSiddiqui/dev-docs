// Read-only evidence for one explicitly identified project. No auth/key queries.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import postgres from 'postgres';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const projectId = process.argv[2];
if (!/^[a-f\d-]{36}$/i.test(projectId ?? '')) throw new Error('An explicit project UUID is required');
const env = parse(fs.readFileSync(path.join(root, 'apps/api/.env')));
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
try {
  const [project] = await sql`select id, name, type, status, interview_data from projects where id = ${projectId} and deleted_at is null`;
  const documents = await sql`select domain_id, content from documentation_bundles where project_id = ${projectId} order by domain_id`;
  const sessions = await sql`select id, total_domains_completed, is_complete, primary_provider from interview_sessions where project_id = ${projectId}`;
  const messageCounts = await sql`select m.domain_id, m.role, m.error_type, count(*)::int count from interview_messages m join interview_sessions s on m.session_id = s.id where s.project_id = ${projectId} group by m.domain_id, m.role, m.error_type order by m.domain_id, m.role`;
  console.log(JSON.stringify({ project, documents, sessions, messageCounts }));
} catch (error) {
  console.error(JSON.stringify({ errorType: error.name, errorCode: error.code }));
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
