import { beforeEach, describe, expect, it, vi } from "vitest";

const memberships = vi.hoisted(() => ({
  getCredentialsByUsername: vi.fn(),
  getMembershipByEmail: vi.fn(),
  touchSignIn: vi.fn(async () => undefined),
}));

vi.mock("./memberships", () => memberships);

const passwords = vi.hoisted(() => ({ verifyPassword: vi.fn() }));

vi.mock("./passwords", async (importOriginal) => {
  const original = await importOriginal<typeof PasswordsModule>();
  passwords.verifyPassword.mockImplementation(original.verifyPassword);
  return { ...original, verifyPassword: passwords.verifyPassword };
});

import type * as PasswordsModule from "./passwords";
import { hashPassword, UNMATCHABLE_PASSWORD_HASH, verifyPassword } from "./passwords";
import { authOptions, authorizeCredentials } from "./authOptions";

const PASSPHRASE = "a passphrase of twelve+";

describe("authorizeCredentials", () => {
  let passwordHash: string;

  beforeEach(async () => {
    passwordHash = await hashPassword(PASSPHRASE);
    memberships.getCredentialsByUsername.mockReset();
    memberships.touchSignIn.mockClear();
    passwords.verifyPassword.mockClear();
  });

  it("returns null without a lookup or a derivation when either field is blank", async () => {
    await expect(authorizeCredentials({ username: "", password: PASSPHRASE })).resolves.toBeNull();
    await expect(authorizeCredentials({ username: "josie", password: "" })).resolves.toBeNull();
    await expect(authorizeCredentials(undefined)).resolves.toBeNull();
    expect(memberships.getCredentialsByUsername).not.toHaveBeenCalled();
    expect(passwords.verifyPassword).not.toHaveBeenCalled();
  });

  it("returns null for an unknown username, still paying for one derivation against the dummy hash", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue(null);

    await expect(authorizeCredentials({ username: "nobody", password: PASSPHRASE })).resolves.toBeNull();
    expect(passwords.verifyPassword).toHaveBeenCalledTimes(1);
    expect(passwords.verifyPassword).toHaveBeenCalledWith(PASSPHRASE, UNMATCHABLE_PASSWORD_HASH);
    expect(memberships.touchSignIn).not.toHaveBeenCalled();
  });

  it("never matches the dummy hash", async () => {
    const [, N, r, p, salt, digest] = UNMATCHABLE_PASSWORD_HASH.split("$");
    expect([N, r, p]).toEqual(["16384", "8", "1"]);
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(Buffer.from(digest, "base64")).toEqual(Buffer.alloc(64));
    await expect(verifyPassword(PASSPHRASE, UNMATCHABLE_PASSWORD_HASH)).resolves.toBe(false);
  });

  it("returns null for the wrong password", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      passwordHash,
    });

    await expect(authorizeCredentials({ username: "josie", password: `${PASSPHRASE}x` })).resolves.toBeNull();
    expect(memberships.touchSignIn).not.toHaveBeenCalled();
  });

  it("returns null for a banned member even with the right password", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      passwordHash,
      bannedAt: "2026-09-01T00:00:00.000Z",
    });

    await expect(authorizeCredentials({ username: "josie", password: PASSPHRASE })).resolves.toBeNull();
    expect(memberships.touchSignIn).not.toHaveBeenCalled();
  });

  it("returns null for a member with no password set, still paying for one derivation", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({ email: "josie@example.com", role: "editor" });

    await expect(authorizeCredentials({ username: "josie", password: PASSPHRASE })).resolves.toBeNull();
    expect(passwords.verifyPassword).toHaveBeenCalledWith(PASSPHRASE, UNMATCHABLE_PASSWORD_HASH);
  });

  it("returns the member and records the sign-in on the happy path", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      name: "Josie",
      passwordHash,
    });

    await expect(authorizeCredentials({ username: "  josie ", password: PASSPHRASE })).resolves.toEqual({
      id: "josie@example.com",
      email: "josie@example.com",
      name: "Josie",
    });
    expect(memberships.getCredentialsByUsername).toHaveBeenCalledWith("josie");
    expect(memberships.touchSignIn).toHaveBeenCalledWith("josie@example.com");
  });
});

describe("jwt callback", () => {
  const jwt = authOptions.callbacks!.jwt!;
  const call = (token: Record<string, unknown>) =>
    jwt({ token, user: undefined as never, account: null, profile: undefined, trigger: undefined, isNewUser: undefined, session: undefined });

  beforeEach(() => {
    memberships.getMembershipByEmail.mockReset();
  });

  it("revokes a session after its password revision changes", async () => {
    memberships.getMembershipByEmail.mockResolvedValue({
      email: "josie@example.com", role: "editor_translator", glossaryLocales: ["nl"],
      passwordUpdatedAt: "2026-09-22T10:00:00.001Z",
    });
    await expect(call({ email: "josie@example.com", passwordUpdatedAt: "2026-09-22T10:00:00.000Z" })).resolves.toMatchObject({
      role: "viewer", glossaryLocales: [],
    });
    await expect(call({ email: "josie@example.com" })).resolves.toMatchObject({
      role: "viewer", glossaryLocales: [],
    });
  });

  it("grants a newly signed-in session at the current password revision", async () => {
    const passwordUpdatedAt = new Date(Date.UTC(2026, 8, 22, 10, 0, 0, 1)).toISOString();
    memberships.getMembershipByEmail.mockResolvedValue({
      email: "josie@example.com", role: "editor", passwordUpdatedAt,
    });
    const token = await jwt({
      token: { email: "josie@example.com" },
      user: { id: "josie@example.com", email: "josie@example.com", passwordUpdatedAt },
      account: null, profile: undefined, trigger: "signIn", isNewUser: false, session: undefined,
    });
    expect(token).toMatchObject({ role: "editor", passwordUpdatedAt });
    await expect(call(token)).resolves.toMatchObject({ role: "editor", passwordUpdatedAt });
  });

  it("keeps the sign-in revision when a reset races with the membership read", async () => {
    memberships.getMembershipByEmail.mockResolvedValue({
      email: "josie@example.com", role: "admin", passwordUpdatedAt: "2026-09-22T10:00:00.001Z",
    });
    const token = await jwt({
      token: { email: "josie@example.com" },
      user: { id: "josie@example.com", email: "josie@example.com", passwordUpdatedAt: "2026-09-22T10:00:00.000Z" },
      account: null, profile: undefined, trigger: "signIn", isNewUser: false, session: undefined,
    });
    expect(token).toMatchObject({ role: "viewer", passwordUpdatedAt: "2026-09-22T10:00:00.000Z" });
    await expect(call(token)).resolves.toMatchObject({ role: "viewer", passwordUpdatedAt: "2026-09-22T10:00:00.000Z" });
  });

  it("replaces both capabilities and glossary scope on every refresh", async () => {
    memberships.getMembershipByEmail.mockResolvedValue({ email: "josie@example.com", role: "editor_translator", glossaryLocales: ["nl"] });
    const granted = await call({ email: "josie@example.com", role: "admin", glossaryLocales: ["zh-Hans"] });
    expect(granted).toMatchObject({ role: "editor_translator", glossaryLocales: ["nl"] });
    memberships.getMembershipByEmail.mockResolvedValue({ email: "josie@example.com", role: "editor" });
    await expect(call(granted)).resolves.toMatchObject({ role: "editor", glossaryLocales: [] });
  });

  it("degrades a banned member to viewer", async () => {
    memberships.getMembershipByEmail.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      bannedAt: "2026-09-01T00:00:00.000Z",
    });

    await expect(call({ email: "josie@example.com", role: "editor_translator", glossaryLocales: ["nl"] })).resolves.toMatchObject({ role: "viewer", glossaryLocales: [] });
  });

  it("fails closed to viewer, and logs, when the membership read fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    memberships.getMembershipByEmail.mockRejectedValue(new Error("offline"));

    await expect(call({ email: "josie@example.com", role: "editor_translator", glossaryLocales: ["nl"] })).resolves.toMatchObject({
      email: "josie@example.com",
      role: "viewer",
      glossaryLocales: [],
    });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("degraded to viewer"), expect.any(Error));
  });

  it("treats an email with no membership row as viewer", async () => {
    memberships.getMembershipByEmail.mockResolvedValue(null);

    await expect(call({ email: "gone@example.com", role: "editor" })).resolves.toMatchObject({ role: "viewer" });
  });
});
