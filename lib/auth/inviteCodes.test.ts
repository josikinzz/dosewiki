import { describe, expect, it } from "vitest";
import { hashInviteCode, normalizeInviteCode } from "./inviteCodes";

describe("invite codes", () => {
  it("hashes the normalized code to sha256 hex", () => {
    expect(hashInviteCode("abcd")).toBe("88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589");
    expect(hashInviteCode(normalizeInviteCode("AB-CD"))).toBe(hashInviteCode("abcd"));
  });
});
