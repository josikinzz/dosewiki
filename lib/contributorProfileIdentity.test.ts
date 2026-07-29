import { describe, expect, it } from "vitest";
import {
  deriveProfileKeyFromEmail,
  findContributorProfileByKeyOrAlias,
  materializeContributorProfile,
  normalizeProfileAliases,
  resolveOwnedProfileKey,
  sanitizeContributorRole,
} from "./contributorProfileIdentity";

describe("contributor profile identity", () => {
  it("derives profile keys from credential email local parts", () => {
    expect(deriveProfileKeyFromEmail("editor@example.com")).toBe("EDITOR");
    expect(deriveProfileKeyFromEmail(" local.user+github@example.com ")).toBe("LOCALUSERGITHUB");
    expect(deriveProfileKeyFromEmail("---@example.com")).toBe("---");
    expect(deriveProfileKeyFromEmail("...@example.com")).toBe("...@EXAMPLE.COM");
    expect(deriveProfileKeyFromEmail("")).toBe("");
  });

  it("resolves the owned key from raw input or actor email", () => {
    expect(resolveOwnedProfileKey(" alice ", "editor@example.com")).toBe("ALICE");
    expect(resolveOwnedProfileKey("", "editor@example.com")).toBe("EDITOR");
    expect(resolveOwnedProfileKey(undefined, "local.user@example.com")).toBe("LOCALUSER");
  });

  it("normalizes aliases for public matching", () => {
    expect(normalizeProfileAliases([" Editor ", "editor", "", "Old Name"])).toEqual([
      "editor",
      "old name",
    ]);
  });

  it("finds profiles by exact key or alias through one lookup interface", () => {
    const profiles = [
      materializeContributorProfile({
        key: "EDITOR",
        displayName: "Editor",
        aliases: ["old-editor"],
        avatarUrl: null,
        bio: "",
        links: [],
      }),
    ].filter(Boolean);

    expect(findContributorProfileByKeyOrAlias(profiles, "editor")?.key).toBe("EDITOR");
    expect(findContributorProfileByKeyOrAlias(profiles, "OLD-EDITOR")?.key).toBe("EDITOR");
    expect(findContributorProfileByKeyOrAlias(profiles, "missing")).toBeNull();
  });
});

describe("contributor role titles", () => {
  it("collapses whitespace and truncates a role without inventing one", () => {
    expect(sanitizeContributorRole("  Former   Dev \n")).toBe("Former Dev");
    expect(sanitizeContributorRole("")).toBe("");
    expect(sanitizeContributorRole("   ")).toBe("");
    expect(sanitizeContributorRole(null)).toBe("");
    expect(sanitizeContributorRole(undefined)).toBe("");
    expect(sanitizeContributorRole("R".repeat(200))).toHaveLength(80);
  });

  it("materializes a role only when the record carries one", () => {
    const base = { key: "RHO", displayName: "Rho", aliases: [], avatarUrl: null, bio: "", links: [] };

    expect(materializeContributorProfile({ ...base, role: "Replication Artist" })?.role).toBe(
      "Replication Artist",
    );

    // Absent rather than empty: the profile header renders nothing at all for a
    // contributor with no title, so the field must not exist.
    const withoutRole = materializeContributorProfile(base);
    expect(withoutRole?.role).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(withoutRole!, "role")).toBe(false);
    expect(materializeContributorProfile({ ...base, role: "   " })?.role).toBeUndefined();
  });
});
