// Apply committed migrations without running the truncating integration setup.
import fs from 'node:fs';
import { parse } from 'dotenv';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
const env = parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const sql = postgres(process.env.DATABASE_URL ?? env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
try {
  await migrate(drizzle(sql), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  console.log('Committed migrations applied successfully; no tables truncated.');
} catch (error) {
  console.error(JSON.stringify({ migrationFailed: true, errorType: error.name, errorCode: error.cause?.code ?? error.code }));
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
