import { describe, expect, it } from 'vitest';
import { redactText, redactUrl } from '../../../web/e2e/lib/monitoring/redact';
import { expectedNavigationCancellation } from '../../../web/e2e/lib/monitoring/cancellation';

it('classifies only aborted same-origin Next navigation fetches as expected cancellations', () => {
  const page = 'http://localhost:3000/dashboard';
  const url = 'http://localhost:3000/project/test/interview?_rsc=abc';
  expect(expectedNavigationCancellation('GET', url, page, '1', 'net::ERR_ABORTED')).toBe(true);
  expect(expectedNavigationCancellation('POST', 'http://localhost:4000/ai/stream', page, undefined, 'net::ERR_ABORTED')).toBe(false);
  expect(expectedNavigationCancellation('GET', url, page, undefined, 'net::ERR_ABORTED')).toBe(false);
  expect(expectedNavigationCancellation('GET', url, page, '1', 'net::ERR_CONNECTION_RESET')).toBe(false);
  expect(expectedNavigationCancellation('GET', url.replace(':3000', ':4000'), page, '1', 'net::ERR_ABORTED')).toBe(false);
});

describe('live browser artifact redaction', () => {
  it('removes Clerk cookies and handshake parameters', () => {
    const value = redactUrl('https://example.test/v1/client?__session=private-session&__clerk_handshake=private-handshake&__clerk_db_jwt=private-jwt&format=nonce');
    expect(value).not.toContain('private-');
    expect(value).toContain('format=nonce');
  });
  it('redacts nested redirect URLs and URL credentials', () => {
    const value = redactUrl('https://user:password@example.test/?redirect_url=' + encodeURIComponent('https://app.test/?code=private-code'));
    expect(value).not.toContain('password');
    expect(value).not.toContain('private-code');
  });
  it('preserves procedure matching and ordinary query inputs', () => {
    expect(redactUrl('http://localhost:4000/trpc/projects.list?batch=1&input=%7B%7D')).toBe('http://localhost:4000/trpc/projects.list?batch=1&input=%7B%7D');
  });
  it('redacts JWTs and bearer values in console errors', () => {
    expect(redactText('failed Bearer private-token and eyJhbGciOiJSUzI1NiJ9.payload.signature')).toBe('failed Bearer [redacted] and [redacted]');
  });
});
