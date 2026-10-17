import { describe, it, expect, vi } from 'vitest';
import { encryptKey, decryptKey, maskKey } from './crypto';

describe('provider key encryption', () => {
  it('roundtrips Unicode and uses a unique nonce per encryption', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    const secret = 'fake-key-🔐-1234567890';
    const first = encryptKey(secret), second = encryptKey(secret);
    expect(first).not.toBe(second); expect(first).not.toContain(secret);
    expect(decryptKey(first)).toBe(secret); expect(decryptKey(second)).toBe(secret);
  });
  it('rejects tampering and the wrong encryption key', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    const cipher = encryptKey('fake-provider-key');
    const bytes = Buffer.from(cipher, 'base64'); bytes[bytes.length - 1] ^= 1;
    expect(() => decryptKey(bytes.toString('base64'))).toThrow();
    vi.stubEnv('ENCRYPTION_KEY', 'cd'.repeat(32)); expect(() => decryptKey(cipher)).toThrow();
  });
  it.each(['', 'abc', 'z'.repeat(64)])('rejects invalid encryption configuration', value => {
    vi.stubEnv('ENCRYPTION_KEY', value); expect(() => encryptKey('fake-key')).toThrow();
  });
  it.each(['short', '1234567890', 'sk-ant-test-12345678901234567890'])('never exposes the full secret in masks', key => {
    expect(maskKey(key)).not.toContain(key);
    // Even short accepted keys must retain hidden characters, not just insert dots.
    expect(maskKey(key).replace(/•/g, '').length).toBeLessThan(key.length);
  });
});
