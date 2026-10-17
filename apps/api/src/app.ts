// Vercel's Hono entry point; the standalone server uses hono-server.ts.
import type { Hono } from 'hono';
import app from './hono-app';
import { initSentry } from './lib/sentry';

initSentry();

export default app satisfies Hono;
