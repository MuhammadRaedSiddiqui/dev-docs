// Vercel's Hono entry point; the standalone server uses hono-server.ts.
import app from './hono-app';
import { initSentry } from './lib/sentry';

initSentry();

export default app;
