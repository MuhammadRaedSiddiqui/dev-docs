import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./db', () => ({ db: {}, userApiKeys: {} }));
import { verifyApiKey } from './apiKeys';

afterEach(() => vi.unstubAllGlobals());

it('verifies Meta text-model access without a paid generation request', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await verifyApiKey('metamuse', 'fake-key')).toBeNull();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.meta.ai/v1/models/muse-spark-1.3-contributor');
  expect(options.method).toBe('GET');
  expect(options.body).toBeUndefined();
});

it.each([
  [401, 'Invalid Meta Muse API key'],
  [403, 'project permissions'],
  [404, 'cannot access muse-spark-1.3-contributor'],
  [429, 'could not be checked'],
  [500, 'API error 500'],
])('rejects Meta verification HTTP %i with an actionable safe error', async (status, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-provider-details', { status })));
  const error = await verifyApiKey('metamuse', 'fake-key');
  expect(error).toContain(message);
  expect(error).not.toContain('private-provider-details');
  expect(error).not.toContain('fake-key');
});

it('reports failed Meta access checks without claiming the key is verified', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-network-details')));
  expect(await verifyApiKey('metamuse', 'fake-key')).toBe('Network error while verifying the API key.');
});
