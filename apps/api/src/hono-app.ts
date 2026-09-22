// apps/api/src/hono-app.ts
// Hono application - high-performance replacement for Express
// Now includes tRPC for type-safe API calls

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { sql } from 'drizzle-orm';

// Import routers
import aiRouter from './routes/hono/ai';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { db } from './lib/db';
import { logger } from './lib/logger';
import { captureError } from './lib/sentry';
import { beginRequest, recordServerError, renderMetrics } from './lib/metrics';

const app = new Hono();

// ── Middleware ────────────────────────────────────────────────────────────────

// Security headers
app.use('*', secureHeaders());

// CORS configuration
app.use('*', cors({
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Correlate every response and emit structured latency/status logs.
app.use('*', async (c, next) => {
  const suppliedId = c.req.header('x-request-id');
  const requestId = suppliedId && suppliedId.length <= 128 ? suppliedId : crypto.randomUUID();
  const started = performance.now();
  const finishMetric = beginRequest();
  c.header('x-request-id', requestId);
  try {
    await next();
  } finally {
    finishMetric();
    logger.info({
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    }, 'HTTP request completed');
  }
});

// Pretty JSON in development
if (process.env.NODE_ENV !== 'production') {
  app.use('*', prettyJSON());
}

// ── tRPC Endpoint ─────────────────────────────────────────────────────────────
// All tRPC calls go through /trpc/*
app.all('/trpc/*', async (c) => {
  return fetchRequestHandler({
    router: appRouter,
    createContext,
    endpoint: '/trpc',
    req: c.req.raw,
  });
});

// Operational endpoints

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: '@devdocs/api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? 'unknown',
  });
});

// Liveness only proves the API process can answer HTTP requests.
app.get('/health/live', (c) => c.json({ status: 'ok' }));

// Readiness verifies the required database dependency before a load balancer
// sends traffic to this instance.
app.get('/health/ready', async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ready', database: 'ok' });
  } catch (err) {
    logger.error({ err }, 'Readiness database check failed');
    return c.json({ status: 'not_ready', database: 'unavailable' }, 503);
  }
});

// Prometheus text format for scraping by a metrics collector.
app.get('/metrics', (c) => c.text(renderMetrics(), 200, {
  'content-type': 'text/plain; version=0.0.4; charset=utf-8',
}));

// SSE remains HTTP because it is not supported by the current tRPC batch link.
app.route('/ai', aiRouter);

// Welcome endpoint
app.get('/', (c) => {
  return c.json({
    message: 'DevDocs API',
    routes: {
      health: '/health',
      trpc: '/trpc',
      aiStream: '/ai/stream (SSE)',
    },
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  const requestId = c.res.headers.get('x-request-id');
  recordServerError();
  logger.error({ err, requestId, method: c.req.method, path: new URL(c.req.url).pathname }, 'Unhandled HTTP error');
  captureError(err, { requestId, method: c.req.method, path: new URL(c.req.url).pathname });
  return c.json({
    error: 'server_error',
    message: 'An unexpected error occurred.',
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'not_found',
    message: 'Route not found.',
  }, 404);
});

export default app;
