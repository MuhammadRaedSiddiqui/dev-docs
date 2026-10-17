// apps/api/src/lib/crypto.ts
// AES-256-GCM encryption for API keys stored in the database.
// The key never leaves the server — the browser only ever sees the masked version.
//
// Generate ENCRYPTION_KEY with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt an API key for storage in the database.
 * Output format: base64(IV[12] + AuthTag[16] + Ciphertext)
 */
export function encryptKey(plaintext: string): string {
  const key    = getKey();
  const iv     = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt an API key retrieved from the database.
 */
export function decryptKey(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");

  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * Mask an API key for display in the settings UI.
 * "sk-ant-api03-abcdefg..." → "sk-ant-api03-••••••••••••1234"
 */
export function maskKey(key: string): string {
  if (key.length < 8) return "••••••••";
  const prefix = key.slice(0, Math.min(12, Math.max(0, key.length - 8)));
  const suffix = key.slice(-4);
  return `${prefix}••••••••••••${suffix}`;
}
