import { describe, expect, it } from "vitest";
import {
  formatInviteCode,
  generateInviteCode,
  hashInviteCode,
  isWellFormedInviteCode,
  normalizeInviteCode,
} from "./inviteCodes";

describe("invite codes", () => {
  it("generates 24 unambiguous characters in six groups of four", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){5}$/);
    expect(code).not.toMatch(/[01oil]/);
    expect(normalizeInviteCode(code)).toHaveLength(24);
    expect(generateInviteCode()).not.toBe(code);
  });

  it("normalizes case, dashes and whitespace so what the visitor types matches what was minted", () => {
    const code = generateInviteCode();
    const typed = ` ${code.toUpperCase().replace(/-/g, " ")} `;
    expect(normalizeInviteCode(typed)).toBe(normalizeInviteCode(code));
    expect(formatInviteCode(typed)).toBe(code);
    expect(isWellFormedInviteCode(normalizeInviteCode(typed))).toBe(true);
    expect(isWellFormedInviteCode("short")).toBe(false);
    expect(isWellFormedInviteCode(`${"a".repeat(23)}!`)).toBe(false);
  });

  it("hashes the normalized code to sha256 hex", () => {
    expect(hashInviteCode("abcd")).toBe("88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589");
    expect(hashInviteCode(normalizeInviteCode("AB-CD"))).toBe(hashInviteCode("abcd"));
  });
});
