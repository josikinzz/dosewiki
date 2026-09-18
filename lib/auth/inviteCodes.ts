import { createHash, randomBytes } from "node:crypto";

/**
 * Invite code plaintext and hashing.
 *
 * A code is 24 characters drawn from a base32-style alphabet (no 0/1/o/i/l
 * confusables), shown to the admin once as six dash-separated groups of four.
 * Only `hashInviteCode(normalizeInviteCode(code))` is ever stored or looked
 * up, so a leaked table cannot be redeemed.
 */

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const INVITE_CODE_LENGTH = 24
const GROUP_SIZE = 4;

export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return formatInviteCode(code);
}

/** Lowercases and strips dashes and whitespace; the stored form. */
export function normalizeInviteCode(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]+/g, "");
}

/** `xxxx-xxxx-xxxx-xxxx-xxxx-xxxx` from either a raw or already formatted code. */
export function formatInviteCode(input: string): string {
  const normalized = normalizeInviteCode(input);
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += GROUP_SIZE) {
    groups.push(normalized.slice(index, index + GROUP_SIZE));
  }
  return groups.join("-");
}

export function isWellFormedInviteCode(normalized: string): boolean {
  return normalized.length === INVITE_CODE_LENGTH && /^[a-z0-9]+$/.test(normalized);
}

/** sha256 hex of the normalized code. */
export function hashInviteCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
