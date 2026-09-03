import { beforeEach, describe, expect, it, vi } from "vitest";

const memberships = vi.hoisted(() => ({
  getCredentialsByUsername: vi.fn(),
  getMembershipByEmail: vi.fn(),
  touchSignIn: vi.fn(async () => undefined),
}));

vi.mock("./convexMemberships", () => memberships);

import { hashPassword } from "./passwords";
import { authOptions, authorizeCredentials } from "../../auth";

const PASSWORD = "a passphrase of twelve+";

describe("authOptions", () => {
  it("registers exactly one credentials provider with username and password", () => {
    expect(authOptions.providers).toHaveLength(1);

    const [provider] = authOptions.providers;
    expect(provider.type).toBe("credentials");
    expect(provider.id).toBe("credentials");
    if (provider.type !== "credentials") {
      throw new Error("expected a credentials provider");
    }
    // next-auth v4 keeps the user config under `options` and merges it at runtime.
    expect(Object.keys(provider.options.credentials)).toEqual(["username", "password"]);
    expect(provider.options.authorize).toBe(authorizeCredentials);
    expect(authOptions.session?.strategy).toBe("jwt");
  });
});

describe("authorizeCredentials", () => {
  let passwordHash: string;

  beforeEach(async () => {
    passwordHash = await hashPassword(PASSWORD);
    memberships.getCredentialsByUsername.mockReset();
    memberships.touchSignIn.mockClear();
  });

  it("returns null without a lookup when either field is blank", async () => {
    await expect(authorizeCredentials({ username: "", password: PASSWORD })).resolves.toBeNull();
    await expect(authorizeCredentials({ username: "josie", password: "" })).resolves.toBeNull();
    await expect(authorizeCredentials(undefined)).resolves.toBeNull();
    expect(memberships.getCredentialsByUsername).not.toHaveBeenCalled();
  });

  it("returns null for an unknown username", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue(null);

    await expect(authorizeCredentials({ username: "nobody", password: PASSWORD })).resolves.toBeNull();
    expect(memberships.touchSignIn).not.toHaveBeenCalled();
  });

  it("returns null for the wrong password", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      passwordHash,
    });

    await expect(authorizeCredentials({ username: "josie", password: `${PASSWORD}x` })).resolves.toBeNull();
    expect(memberships.touchSignIn).not.toHaveBeenCalled();
  });

  it("returns null for a banned member even with the right password", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      passwordHash,
      bannedAt: "2026-09-01T00:00:00.000Z",
    });

    await expect(authorizeCredentials({ username: "josie", password: PASSWORD })).resolves.toBeNull();
    expect(memberships.touchSignIn).not.toHaveBeenCalled();
  });

  it("returns null for a member with no password set", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({ email: "josie@example.com", role: "editor" });

    await expect(authorizeCredentials({ username: "josie", password: PASSWORD })).resolves.toBeNull();
  });

  it("returns the member and records the sign-in on the happy path", async () => {
    memberships.getCredentialsByUsername.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      name: "Josie",
      passwordHash,
    });

    await expect(authorizeCredentials({ username: "  josie ", password: PASSWORD })).resolves.toEqual({
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

  it("stamps the stored role on every refresh", async () => {
    memberships.getMembershipByEmail.mockResolvedValue({ email: "josie@example.com", role: "editor" });

    await expect(call({ email: "josie@example.com", role: "admin" })).resolves.toMatchObject({ role: "editor" });
  });

  it("degrades a banned member to viewer", async () => {
    memberships.getMembershipByEmail.mockResolvedValue({
      email: "josie@example.com",
      role: "admin",
      bannedAt: "2026-09-01T00:00:00.000Z",
    });

    await expect(call({ email: "josie@example.com", role: "admin" })).resolves.toMatchObject({ role: "viewer" });
  });

  it("keeps the previous role when the membership read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    memberships.getMembershipByEmail.mockRejectedValue(new Error("offline"));

    await expect(call({ email: "josie@example.com", role: "editor" })).resolves.toMatchObject({ role: "editor" });
  });
});
