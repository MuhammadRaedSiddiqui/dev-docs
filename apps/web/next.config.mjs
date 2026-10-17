// next.config.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const nextConfig = {
  // Keep the development toolbar from covering mobile controls in UI tests.
  ...(process.env.PLAYWRIGHT === '1' ? { devIndicators: false } : {}),
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  webpack(config, { dev }) {
    // The deterministic lane changes module resolution. Include that mode in
    // Webpack's persistent cache key before reusing .next for real Clerk.
    if (config.cache && typeof config.cache === 'object') {
      config.cache.version = `${config.cache.version ?? ''}|clerk:${dev && process.env.PLAYWRIGHT === '1' ? 'mock' : 'real'}`;
    }
    if (dev && process.env.PLAYWRIGHT === '1') {
      config.resolve.alias['@clerk/nextjs$'] = path.resolve('e2e/lib/mocks/clerk.tsx');
    }
    return config;
  },
  // Allow cross-origin requests from the API server in development
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options",        value: "DENY" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // Forward /api/* requests to the Hono API server in development.
  // In production, the API server is on a separate subdomain (api.devdocs.ai)
  // and CORS is configured there — this rewrite is dev-only.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source:      "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
