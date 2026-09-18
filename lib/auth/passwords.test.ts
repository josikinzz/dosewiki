import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, hashPassword, validateNewPassword, verifyPassword } from "./passwords";
import {
  MIN_PASSWORD_LENGTH as SCRIPT_MIN_PASSWORD_LENGTH,
  hashPassword as scriptHashPassword,
  validateNewPassword as scriptValidateNewPassword,
} from "../../scripts/auth/password-hash.mjs";

const PASSPHRASE = "correct horse battery staple";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password through the scrypt$N$r$p$salt$hash format", async () => {
    const stored = await hashPassword(PASSPHRASE);
    const parts = stored.split("$");

    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(["scrypt", "16384", "8", "1"]);
    expect(Buffer.from(parts[4], "base64")).toHaveLength(16);
    expect(Buffer.from(parts[5], "base64")).toHaveLength(64);
    await expect(verifyPassword(PASSPHRASE, stored)).resolves.toBe(true);
  });

  it("salts every hash so identical passwords never share a stored value", async () => {
    const [first, second] = await Promise.all([hashPassword(PASSPHRASE), hashPassword(PASSPHRASE)]);
    expect(first).not.toBe(second);
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword(PASSPHRASE);
    await expect(verifyPassword("correct horse battery stapler", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("rejects malformed stored values without throwing", async () => {
    const stored = await hashPassword(PASSPHRASE);
    const parts = stored.split("$");

    for (const malformed of [
      "",
      "plaintext",
      "bcrypt$10$abc$def",
      "scrypt$16384$8$1$onlyfiveparts",
      ["scrypt", "0", "8", "1", parts[4], parts[5]].join("$"),
      ["scrypt", "1000", "8", "1", parts[4], parts[5]].join("$"),
      ["scrypt", "16384", "8", "1", "", parts[5]].join("$"),
      ["scrypt", "16384", "8", "1", parts[4], "c2hvcnQ="].join("$"),
    ]) {
      await expect(verifyPassword(PASSPHRASE, malformed)).resolves.toBe(false);
    }
  });

  it("does not reuse credentials from a different salt", async () => {
    const [first, second] = await Promise.all([hashPassword(PASSPHRASE), hashPassword("another passphrase!")]);
    const firstParts = first.split("$");
    const secondParts = second.split("$");
    const crossed = [...firstParts.slice(0, 5), secondParts[5]].join("$");

    await expect(verifyPassword(PASSPHRASE, crossed)).resolves.toBe(false);
  });

  it("verifies hashes minted by the seed script module", async () => {
    const stored = await scriptHashPassword(PASSPHRASE);

    expect(stored.split("$").slice(0, 4)).toEqual(["scrypt", "16384", "8", "1"]);
    await expect(verifyPassword(PASSPHRASE, stored)).resolves.toBe(true);
    await expect(verifyPassword(`${PASSPHRASE}!`, stored)).resolves.toBe(false);
  });
});

describe("validateNewPassword", () => {
  it("enforces the minimum length", () => {
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least 12/);
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("refuses leading or trailing whitespace that a sign-in form would trim away", () => {
    expect(validateNewPassword(" twelve chars ok ")).toMatch(/whitespace/);
  });

  it("matches the seed script's rules", () => {
    expect(SCRIPT_MIN_PASSWORD_LENGTH).toBe(MIN_PASSWORD_LENGTH);
    for (const candidate of ["short", "a".repeat(MIN_PASSWORD_LENGTH), " twelve chars ok "]) {
      expect(scriptValidateNewPassword(candidate)).toBe(validateNewPassword(candidate));
    }
  });
});
