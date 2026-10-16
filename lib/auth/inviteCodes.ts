import { createHash, randomBytes } from "node:crypto";

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

export function normalizeInviteCode(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]+/g, "");
}

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

export function hashInviteCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
