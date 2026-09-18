import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthError, requireRole, roleMeetsFloor, type AuthorizedRole, type RoleFloor } from "./auth";

const FLOORS: RoleFloor[] = ["admin", "editor", "translator", "contributor"];
const SERVER_KEY = "test";

type MembershipRow = { email: string; role: AuthorizedRole; bannedAt?: number } | null;

type Identity = { subject: string; email?: string; name?: string } | null;

function createCtx(row: MembershipRow, identity: Identity = null) {
  return {
    db: { query: () => ({ withIndex: () => ({ unique: async () => row }) }) },
    auth: { getUserIdentity: async () => identity },
  } as never;
}

/** Stored role, or `null` for an email with no membership row at all. */
const STORED_ROLES: Array<{ label: string; role: AuthorizedRole | null; passes: RoleFloor[] }> = [
  { label: "admin", role: "admin", passes: ["admin", "editor", "translator", "contributor"] },
  { label: "both", role: "editor_translator", passes: ["editor", "translator", "contributor"] },
  { label: "editor", role: "editor", passes: ["editor", "contributor"] },
  { label: "translator", role: "translator", passes: ["translator", "contributor"] },
  { label: "contributor", role: "contributor", passes: ["contributor"] },
  { label: "viewer", role: "viewer", passes: [] },
  { label: "none", role: null, passes: [] },
];

describe("roleMeetsFloor", () => {
  it.each<[AuthorizedRole, RoleFloor, boolean]>([
    ["admin", "admin", true],
    ["admin", "editor", true],
    ["admin", "translator", true],
    ["admin", "contributor", true],
    ["editor", "admin", false],
    ["editor", "editor", true],
    ["editor", "translator", false],
    ["editor", "contributor", true],
    ["translator", "admin", false],
    ["translator", "editor", false],
    ["translator", "translator", true],
    ["translator", "contributor", true],
    ["contributor", "admin", false],
    ["contributor", "editor", false],
    ["contributor", "translator", false],
    ["contributor", "contributor", true],
    ["viewer", "admin", false],
    ["viewer", "editor", false],
    ["viewer", "translator", false],
    ["viewer", "contributor", false],
  ])("%s against floor %s is %s", (role, floor, expected) => {
    expect(roleMeetsFloor(role, floor)).toBe(expected);
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  describe("server key with a delegated actorEmail takes the stored role", () => {
    for (const stored of STORED_ROLES) {
      for (const floor of FLOORS) {
        const shouldPass = stored.passes.includes(floor);

        it(`${stored.label} ${shouldPass ? "passes" : "is refused at"} the ${floor} floor`, async () => {
          const email = `${stored.label}@example.com`;
          const ctx = createCtx(stored.role ? { email, role: stored.role } : null);
          const call = requireRole(ctx, { apiKey: SERVER_KEY, actorEmail: ` ${email.toUpperCase()} ` }, floor);

          if (shouldPass) {
            await expect(call).resolves.toMatchObject({
              email,
              role: stored.role,
              authMethod: "apiKey",
              adminIntent: "legacyAdmin",
            });
          } else {
            await expect(call).rejects.toThrow(AuthError);
            await expect(call).rejects.toThrow(`${floor.charAt(0).toUpperCase()}${floor.slice(1)} access required`);
          }
        });
      }
    }
  });

  describe("identity calls take the signed-in member's stored role", () => {
    for (const stored of STORED_ROLES) {
      for (const floor of FLOORS) {
        const shouldPass = stored.passes.includes(floor);

        it(`${stored.label} ${shouldPass ? "passes" : "is refused at"} the ${floor} floor`, async () => {
          const email = `${stored.label}@example.com`;
          const ctx = createCtx(stored.role ? { email, role: stored.role } : null, {
            subject: `user|${stored.label}`,
            email,
            name: stored.label,
          });
          const call = requireRole(ctx, {}, floor);

          if (shouldPass) {
            await expect(call).resolves.toMatchObject({
              userId: `user|${stored.label}`,
              email,
              role: stored.role,
              authMethod: "identity",
            });
          } else {
            await expect(call).rejects.toThrow(AuthError);
          }
        });
      }
    }
  });

  it.each(FLOORS)("a server key naming nobody acts as a headless admin at the %s floor", async (floor) => {
    const ctx = createCtx(null);

    await expect(requireRole(ctx, { apiKey: SERVER_KEY }, floor)).resolves.toMatchObject({
      role: "admin",
      email: "system@dosewiki.internal",
      authMethod: "apiKey",
    });
  });

  it.each(FLOORS)("a banned member is refused at the %s floor even with the admin role stored", async (floor) => {
    const email = "banned@example.com";
    const ctx = createCtx({ email, role: "admin", bannedAt: 1 });

    await expect(requireRole(ctx, { apiKey: SERVER_KEY, actorEmail: email }, floor)).rejects.toThrow(
      "This account is banned",
    );
  });

  it.each(FLOORS)("a banned signed-in member is refused at the %s floor", async (floor) => {
    const email = "banned@example.com";
    const ctx = createCtx({ email, role: "admin", bannedAt: 1 }, { subject: "user|banned", email });

    await expect(requireRole(ctx, {}, floor)).rejects.toThrow("This account is banned");
  });

  it("grants nothing to an email pattern: a local.dose.wiki actor without a row is refused", async () => {
    const ctx = createCtx(null);

    await expect(
      requireRole(ctx, { apiKey: SERVER_KEY, actorEmail: "anyone@local.dose.wiki" }, "contributor"),
    ).rejects.toThrow("Contributor access required");
  });

  it("refuses a wrong server key before consulting memberships", async () => {
    const ctx = createCtx({ email: "admin@example.com", role: "admin" });

    await expect(
      requireRole(ctx, { apiKey: "wrong", actorEmail: "admin@example.com" }, "contributor"),
    ).rejects.toThrow("Authentication failed: Invalid API key");
  });

  it("refuses an anonymous identity call before consulting memberships", async () => {
    const ctx = createCtx({ email: "admin@example.com", role: "admin" });

    await expect(requireRole(ctx, {}, "contributor")).rejects.toThrow("Authentication required");
  });

  it("ignores actorEmail on identity calls", async () => {
    const email = "editor@example.com";
    const ctx = createCtx({ email, role: "editor" }, { subject: "user|editor", email });

    await expect(requireRole(ctx, { actorEmail: "admin@example.com" }, "editor")).resolves.toMatchObject({
      email,
      role: "editor",
      authMethod: "identity",
    });
  });
});
