// apps/api/src/trpc/router.ts
// Main tRPC router - combines all sub-routers

import { router } from './trpc';
import { projectsRouter } from './routers/projects';
import { documentsRouter } from './routers/documents';
import { accountRouter } from './routers/account';
import { keysRouter } from './routers/keys';
import { sessionsRouter } from './routers/sessions';

/**
 * Main application router
 * Add new routers here as you create them
 */
export const appRouter = router({
  projects: projectsRouter,
  documents: documentsRouter,
  account: accountRouter,
  keys: keysRouter,
  sessions: sessionsRouter,
});

/**
 * Export type definition for frontend
 * This enables full type safety on the client
 */
export type AppRouter = typeof appRouter;
