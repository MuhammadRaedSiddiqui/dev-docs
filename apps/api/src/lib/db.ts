// apps/api/src/lib/db.ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Use a single connection pool across the process.
// The `max` option is intentionally conservative — most API responses are fast
// and the AI streaming endpoint holds no DB connection during the stream itself.
//
// `prepare: false` is REQUIRED when connecting through Supabase's transaction
// pooler (pgbouncer, port 6543): pgbouncer reuses server connections per
// transaction, so prepared statements from one request can't be relied on by
// the next. Leaving prepared statements on causes intermittent
// "prepared statement ... does not exist" errors under load.
const client = postgres(process.env.DATABASE_URL, { max: 10, prepare: false });

export const db = drizzle(client, { schema });

/** Close the shared connection pool during graceful shutdown and test teardown. */
export async function closeDatabase(): Promise<void> {
  await client.end();
}

export interface ClerkUserIdentity {
  clerkId: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Resolve a Clerk user to the local UUID used by the relational schema.
 *
 * Existing installations may already have users from the pre-Clerk auth
 * system. Matching an unlinked row by email lets those users be migrated on
 * their first successful Clerk request instead of creating a duplicate.
 */
export async function getOrCreateUser(identity: ClerkUserIdentity): Promise<string> {
  const existingByClerkId = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, identity.clerkId),
    columns: { id: true },
  });
  if (existingByClerkId) return existingByClerkId.id;

  const existingByEmail = await db.query.users.findFirst({
    where: eq(schema.users.email, identity.email),
    columns: { id: true, clerkId: true },
  });

  if (existingByEmail) {
    // A row linked to a different Clerk account is an identity collision and
    // must never be silently reassigned.
    if (existingByEmail.clerkId && existingByEmail.clerkId !== identity.clerkId) {
      throw new Error("A different Clerk account is already linked to this email address");
    }

    const [updated] = await db
      .update(schema.users)
      .set({
        clerkId: identity.clerkId,
        displayName: identity.displayName ?? undefined,
        avatarUrl: identity.avatarUrl ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, existingByEmail.id))
      .returning({ id: schema.users.id });
    return updated.id;
  }

  const [created] = await db
    .insert(schema.users)
    .values({
      clerkId: identity.clerkId,
      email: identity.email,
      displayName: identity.displayName ?? null,
      avatarUrl: identity.avatarUrl ?? null,
    })
    .returning({ id: schema.users.id });
  return created.id;
}

// Re-export schema so routes can import from one place: import { db, projects } from "../lib/db"
export * from "../schema";
