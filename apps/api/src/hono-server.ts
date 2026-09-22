// apps/api/src/hono-server.ts
// Standalone Hono server entry point
// Use this to run Hono independently for testing/comparison

// Load environment variables FIRST
import 'dotenv/config';

import { serve } from '@hono/node-server';
import { initSentry } from './lib/sentry';
import { logger } from './lib/logger';
import honoApp from './hono-app';

// Initialize Sentry
initSentry();

const PORT = Number(process.env.PORT ?? 4000);

serve({
  fetch: honoApp.fetch,
  port: PORT,
}, (info) => {
  logger.info({ port: info.port, framework: 'Hono' }, 'Hono server started');
  console.log(`🚀  @devdocs/api (Hono) running at http://localhost:${info.port}`);
  console.log(`    Health:   http://localhost:${info.port}/health`);
  console.log(`    tRPC:       http://localhost:${info.port}/trpc`);
});
