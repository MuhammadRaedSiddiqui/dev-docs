import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
await build({
  entryPoints: ['src/hono-server.ts'], outfile: 'dist/hono-server.cjs',
  bundle: true, platform: 'node', target: 'node20', format: 'cjs', sourcemap: true,
  // Bundle our TypeScript workspace package; load third-party Node packages
  // normally so native Sentry modules and provider SDKs retain their own layout.
  external: Object.keys(pkg.dependencies).filter(name => name !== '@devdocs/shared'),
});
