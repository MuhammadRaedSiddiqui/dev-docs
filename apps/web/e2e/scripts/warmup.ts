import type { FullConfig } from '@playwright/test';

export default async function warmup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  // Compile each development route before measuring browser assertions. This
  // keeps cold Next.js compilation out of feature timeouts on slower machines.
  for (const path of ['/', '/dashboard', '/templates', '/docs', '/settings', '/sign-in', '/project/00000000-0000-4000-a000-000000000001/interview']) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`E2E warmup failed: ${path} (${response.status})`);
    await response.text();
  }
}
