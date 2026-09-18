/**
 * Password hashing for workstation scripts. Mirrors `lib/auth/passwords.ts`
 * exactly (scrypt N=16384 r=8 p=1, 16-byte salt, 64-byte key, stored as
 * `scrypt$N$r$p$saltB64$hashB64`) so a hash minted here verifies in the app.
 * `lib/auth/passwords.test.ts` cross-checks the two implementations.
 */

import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export const MIN_PASSWORD_LENGTH = 12;

const scryptAsync = promisify(scrypt);

export function validateNewPassword(plain) {
  if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (plain.trim().length !== plain.length) {
    return "Password must not start or end with whitespace.";
  }
  return null;
}

export async function hashPassword(plain) {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(plain, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}
