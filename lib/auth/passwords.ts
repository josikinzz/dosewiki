import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export { MIN_PASSWORD_LENGTH, validateNewPassword } from "./passwordPolicy";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Uint8Array,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

function deriveKey(plain: string, salt: Uint8Array, N: number, r: number, p: number): Promise<Buffer> {
  return scryptAsync(plain, salt, KEY_BYTES, { N, r, p, maxmem: 128 * N * r * 2 });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveKey(plain, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export const UNMATCHABLE_PASSWORD_HASH = [
  "scrypt",
  String(SCRYPT_N),
  String(SCRYPT_R),
  String(SCRYPT_P),
  Buffer.alloc(SALT_BYTES).toString("base64"),
  Buffer.alloc(KEY_BYTES).toString("base64"),
].join("$");

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (typeof plain !== "string" || typeof stored !== "string") {
    return false;
  }

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const N = parsePositiveInt(parts[1]);
  const r = parsePositiveInt(parts[2]);
  const p = parsePositiveInt(parts[3]);
  if (N === null || r === null || p === null || (N & (N - 1)) !== 0) {
    return false;
  }

  const salt = Uint8Array.from(Buffer.from(parts[4], "base64"));
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length === 0 || expected.length !== KEY_BYTES) {
    return false;
  }

  const actual = await deriveKey(plain, salt, N, r, p);
  return timingSafeEqual(actual, expected);
}
