import { describe, expect, it } from "vitest";
import {
  canAccessDevShell,
  canUseEditorWriteRoute,
  canUseSelfProfileRoute,
  getDevRouteDecision,
  resolveSessionRole,
} from "./roles";

describe("role policy", () => {
  it.each([
    ["anonymous", undefined, null, false, false],
    ["viewer", "viewer", "viewer", false, true],
    ["editor", "editor", "editor", true, true],
    ["admin", "admin", "admin", true, true],
    ["invalid token role", "owner", null, false, true],
  ] as const)(
    "resolves %s role decisions",
    (_label, role, expectedRole, expectedEditorAccess, expectedProfileAccess) => {
      expect(resolveSessionRole({ role })).toBe(expectedRole);
      expect(canAccessDevShell({ role })).toBe(expectedEditorAccess);
      expect(canUseEditorWriteRoute({ role })).toBe(expectedEditorAccess);
      expect(canUseSelfProfileRoute({ email: expectedProfileAccess ? "user@example.com" : null })).toBe(
        expectedProfileAccess,
      );
    },
  );

  it("grants legacy credential users admin only in development", () => {
    expect(
      resolveSessionRole({
        role: "viewer",
        isDevelopmentCredentialUser: true,
        nodeEnv: "development",
      }),
    ).toBe("admin");

    expect(
      resolveSessionRole({
        role: "viewer",
        isDevelopmentCredentialUser: true,
        nodeEnv: "production",
      }),
    ).toBe("viewer");
  });

  it.each([
    ["/dev", "", undefined, undefined, { type: "sign-in", callbackUrl: "/dev" }],
    ["/dev", "?tab=articles", undefined, undefined, { type: "sign-in", callbackUrl: "/dev?tab=articles" }],
    ["/dev", "", "viewer@example.com", "viewer", { type: "unauthorized", from: "/dev", role: "viewer" }],
    ["/dev/profile", "", "viewer@example.com", "viewer", { type: "allow", role: "viewer" }],
    ["/dev/profiles/ABC", "", "viewer@example.com", "viewer", { type: "allow", role: "viewer" }],
    ["/dev", "", "editor@example.com", "editor", { type: "allow", role: "editor" }],
    ["/dev", "", "admin@example.com", "admin", { type: "allow", role: "admin" }],
    ["/dev", "", "bad-role@example.com", "owner", { type: "unauthorized", from: "/dev", role: null }],
  ] as const)("decides routing for %s", (pathname, search, email, role, expected) => {
    expect(getDevRouteDecision({ pathname, search, email, role })).toEqual(expected);
  });
});
