import { it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({ getRedis: vi.fn() }));
vi.mock('./redis', () => mock);
import { checkRateLimit } from './rateLimit';

it('allows requests when optional Redis is unconfigured', async () => {
  mock.getRedis.mockReturnValue(null);
  expect((await checkRateLimit('user', 20, 60)).allowed).toBe(true);
});
it('fails open on Redis transport errors', async () => {
  mock.getRedis.mockReturnValue({ eval: vi.fn().mockRejectedValue(new Error('offline')) });
  expect((await checkRateLimit('user', 20, 60)).allowed).toBe(true);
});
it.each([[1, true, 19], [20, true, 0], [21, false, 0]])('enforces count %i', async (count, allowed, remaining) => {
  mock.getRedis.mockReturnValue({ eval: vi.fn().mockResolvedValue([count, 42]) });
  expect(await checkRateLimit('user', 20, 60)).toEqual({ allowed, remaining, resetIn: 42 });
});
