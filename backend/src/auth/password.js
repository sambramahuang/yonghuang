import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// scrypt is in Node's standard library, so password storage adds no dependency.
// Parameters follow the Node defaults except N, raised to 2^15 to slow guessing.
const KEYLEN = 64;
const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Returns `scrypt$N$r$p$salt$hash`, all fields needed to verify it later. */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must contain at least 8 characters');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, OPTIONS);
  return `scrypt$${OPTIONS.N}$${OPTIONS.r}$${OPTIONS.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

/**
 * Constant-time verification. Returns false rather than throwing on a malformed
 * or absent hash, so a user row without a password behaves like a wrong one and
 * cannot be distinguished by timing or by error message.
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'base64url');
    const derived = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: OPTIONS.maxmem,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
