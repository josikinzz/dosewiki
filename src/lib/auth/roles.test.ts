import { describe, expect, it } from "vitest";
import { DEV_TAB_REGISTRY, findDevTab } from "@/features/dev/pages/devTabRegistry";
import {
  canAccessDev,
  approvedGlossaryLocales,
  canAccessGlossaryLocale,
  parseGlossaryLocaleGrant,
  canApprove,
  canDraft,
  canUseSelfProfileRoute,
  getDevRouteDecision,
  getRoleFloorLockReason,
  resolveSessionRole,
  roleMeetsFloor,
  type AppRole,
  type RoleFloor,
} from "./roles";

describe("role policy", () => {
  it.each([
    ["anonymous", undefined, null],
    ["viewer", "viewer", "viewer"],
    ["contributor", "contributor", "contributor"],
    ["translator", "translator", "translator"],
    ["editor", "editor", "editor"],
    ["both", "editor_translator", "editor_translator"],
    ["admin", "admin", "admin"],
    ["invalid token role", "owner", null],
  ] as const)("resolves the %s session role", (_label, role, expectedRole) => {
    expect(resolveSessionRole({ role })).toBe(expectedRole);
  });

  it("treats any non-empty email as a signed-in account", () => {
    expect(canUseSelfProfileRoute({ email: "user@example.com" })).toBe(true);
    expect(canUseSelfProfileRoute({ email: "  " })).toBe(false);
    expect(canUseSelfProfileRoute({ email: null })).toBe(false);
  });

  it.each([
    // role, meets contributor, meets translator, meets editor, meets admin
    [null, false, false, false, false],
    ["viewer", false, false, false, false],
    ["contributor", true, false, false, false],
    ["translator", true, true, false, false],
    ["editor", true, false, true, false],
    ["editor_translator", true, true, true, false],
    ["admin", true, true, true, true],
  ] as const)("ranks %s against each floor", (role, contributor, translator, editor, admin) => {
    expect(roleMeetsFloor(role, "contributor")).toBe(contributor);
    expect(roleMeetsFloor(role, "translator")).toBe(translator);
    expect(roleMeetsFloor(role, "editor")).toBe(editor);
    expect(roleMeetsFloor(role, "admin")).toBe(admin);
    expect(canAccessDev(role)).toBe(contributor);
    expect(canDraft(role)).toBe(editor);
    expect(canApprove(role)).toBe(admin);
  });

  it("fails closed for missing language grants and never lets Editor imply Translator", () => {
    expect(approvedGlossaryLocales({ role: "translator" })).toEqual([]);
    expect(canAccessGlossaryLocale({ role: "editor", glossaryLocales: ["nl"] }, "nl")).toBe(false);
    expect(canAccessGlossaryLocale({ role: "editor_translator", glossaryLocales: ["nl"] }, "nl")).toBe(true);
    expect(canAccessGlossaryLocale({ role: "translator", glossaryLocales: ["nl"] }, "zh-Hans")).toBe(false);
    expect(canAccessGlossaryLocale({ role: "admin" }, "zh-Hans")).toBe(true);
    expect(() => parseGlossaryLocaleGrant("translator", [])).toThrow();
    expect(() => parseGlossaryLocaleGrant("translator", ["unknown"])).toThrow();
    expect(() => parseGlossaryLocaleGrant("editor", ["nl"])).toThrow();
  });

  it("names why a floor is closed, and nothing when it is open", () => {
    expect(getRoleFloorLockReason("admin", "admin")).toBeNull();
    expect(getRoleFloorLockReason("editor", "contributor")).toBeNull();
    expect(getRoleFloorLockReason("editor", "admin")).toBe("Admin role required");
    expect(getRoleFloorLockReason("contributor", "editor")).toBe("Editor role required");
    expect(getRoleFloorLockReason("contributor", "translator")).toBe("Translator role required");
    expect(getRoleFloorLockReason("translator", "translator")).toBeNull();
    expect(getRoleFloorLockReason("viewer", "contributor")).toBe("Contributor role required");
    expect(getRoleFloorLockReason(null, "contributor")).toBe("Sign in required");
  });

  it.each([
    ["/dev", "", undefined, undefined, { type: "sign-in", callbackUrl: "/dev" }],
    ["/dev", "?tab=articles", undefined, undefined, { type: "sign-in", callbackUrl: "/dev?tab=articles" }],
    ["/dev/banners", "", "", "admin", { type: "sign-in", callbackUrl: "/dev/banners" }],
    ["/dev", "", "viewer@example.com", "viewer", { type: "unauthorized", role: "viewer", from: "/dev" }],
    ["/dev/contributors", "", "viewer@example.com", "viewer", { type: "unauthorized", role: "viewer", from: "/dev/contributors" }],
    ["/dev", "", "bad-role@example.com", "owner", { type: "unauthorized", role: null, from: "/dev" }],
    ["/dev", "", "contributor@example.com", "contributor", { type: "allow", access: "contributor" }],
    ["/dev/contributors", "", "contributor@example.com", "contributor", { type: "allow", access: "contributor" }],
    ["/dev", "", "translator@example.com", "translator", { type: "allow", access: "translator" }],
    ["/dev", "", "editor@example.com", "editor", { type: "allow", access: "editor" }],
    ["/dev", "", "admin@example.com", "admin", { type: "allow", access: "admin" }],
  ] as const)("decides the shell route for %s", (pathname, search, email, role, expected) => {
    expect(getDevRouteDecision({ pathname, search, email, role })).toEqual(expected);
  });

  const roleMatrix: readonly (AppRole | null)[] = ["admin", "editor_translator", "editor", "translator", "contributor", "viewer", null];

  it.each([
    ["an admin tab", findDevTab("banners").role],
    ["an editor tab", findDevTab("articles").role],
    ["a translator tab", findDevTab("glossary").role],
    ["a contributor tab", findDevTab("contributors").role],
  ] as const)("lets any member role load %s so the shell can disable it", (_label, tabRole) => {
    expect(DEV_TAB_REGISTRY.map((tab) => tab.role)).toContain(tabRole);
    for (const role of roleMatrix) {
      const decision = getDevRouteDecision({ pathname: "/dev", email: "member@example.com", role });
      if (role === null || role === "viewer") {
        expect(decision).toEqual({ type: "unauthorized", role, from: "/dev" });
      } else {
        expect(decision).toEqual({ type: "allow", access: role });
        // The shell, not the route, decides whether the tab is open to that role.
        expect(getRoleFloorLockReason(role, tabRole) === null).toBe(roleMeetsFloor(role, tabRole));
      }
    }
  });

  it.each([
    ["review", "editor"],
    ["banners", "admin"],
  ] as const)("applies the %s floor to full-page surfaces", (tab, floor: RoleFloor) => {
    expect(findDevTab(tab).role).toBe(floor);
    for (const role of roleMatrix) {
      const decision = getDevRouteDecision({ pathname: "/review", email: "member@example.com", role, floor });
      expect(decision.type).toBe(roleMeetsFloor(role, floor) ? "allow" : "unauthorized");
    }
  });
});
