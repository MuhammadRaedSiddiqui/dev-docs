// apps/api/src/test/setup.ts
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';

// Set test environment
process.env.NODE_ENV = 'test';

// Never infer a test database by rewriting a development/production URL. Tests
// truncate their database, so require an explicitly test-named target.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL (or DATABASE_URL) is required to run API tests');
}
let testDatabaseName: string;
try {
  testDatabaseName = new URL(testDatabaseUrl).pathname.split('/').filter(Boolean).at(-1) ?? '';
} catch {
  throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
}
if (!testDatabaseName.toLowerCase().includes('_test')) {
  throw new Error('Refusing to run API tests against a database whose name does not contain "_test"');
}
process.env.DATABASE_URL = testDatabaseUrl;

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

beforeAll(async () => {
  const { db } = await import('../lib/db');
  await migrate(db, { migrationsFolder });
  await db.execute(sql`TRUNCATE TABLE "users" CASCADE`);
});

afterAll(async () => {
  const { db, closeDatabase } = await import('../lib/db');
  await db.execute(sql`TRUNCATE TABLE "users" CASCADE`);
  await closeDatabase();
});
