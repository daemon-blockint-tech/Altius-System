/**
 * OAuth client utilities — secret hashing and ID/secret generation.
 *
 * Uses Node's crypto.scrypt for password hashing (no external dependency).
 * Client IDs are prefixed 'altius_' for recognisability. Secrets are
 * 32-byte random strings, base64url-encoded.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Hash a plaintext secret using scrypt. */
export function hashSecret(plaintext: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plaintext, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Verify a plaintext secret against a stored hash. */
export function verifySecret(plaintext: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  const actual = scryptSync(plaintext, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Generate a random client ID. */
export function generateClientId(): string {
  return `altius_${randomBytes(12).toString('hex')}`;
}

/** Generate a random client secret. */
export function generateClientSecret(): string {
  return randomBytes(32).toString('base64url');
}
