import { describe, expect, it } from "vitest";
import {
  contributorMatchNames,
  deriveProfileKeyFromEmail,
  findContributorProfileByAuthorName,
  findContributorProfileByKeyOrAlias,
  materializeContributorProfile,
  normalizeProfileAliases,
  profileMatchesName,
  resolveOwnedProfileKey,
  sanitizeContributorRole,
  sanitizeContributorLinks,
} from "./contributorProfileIdentity";

describe("contributor profile identity", () => {
  it("retains six valid profile links and drops overflow without counting invalid links", () => {
    const links = Array.from({ length: 7 }, (_, i) => ({ label: `Link ${i}`, url: `https://example.com/${i}` }));
    expect(sanitizeContributorLinks([{ label: "Invalid", url: "javascript:alert(1)" }, ...links])).toEqual(links.slice(0, 6));
  });

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

describe("contributor name matching", () => {
  const josie = { key: "JOSIE", displayName: "Josie Kins", aliases: ["josie", "josikinz"] };
  const kaytwo = { key: "KAYTWO", displayName: "Kaytwo", aliases: ["kaylee"] };
  const profiles = [josie, kaytwo];

  it("collects the display name and aliases as one deduplicated name set", () => {
    expect(contributorMatchNames({ displayName: "Viscid", aliases: ["viscid", "mark gillis", ""] })).toEqual([
      "viscid",
      "mark gillis",
    ]);
  });

  it("matches an exact display name regardless of case or padding", () => {
    expect(findContributorProfileByAuthorName(profiles, "  josie KINS ")?.key).toBe("JOSIE");
    expect(findContributorProfileByAuthorName(profiles, "Kaytwo")?.key).toBe("KAYTWO");
  });

  it("matches an explicit alias", () => {
    expect(findContributorProfileByAuthorName(profiles, "Kaylee")?.key).toBe("KAYTWO");
    expect(findContributorProfileByAuthorName(profiles, "josikinz")?.key).toBe("JOSIE");
  });

  // "Alex" must not be swallowed by "Alex Grey": one contributor's given name is
  // not a claim on another contributor's credits.
  it("does not match the first word of a longer display name", () => {
    const directory = [{ key: "ALEXGREY", displayName: "Alex Grey", aliases: [] }];

    expect(findContributorProfileByAuthorName(directory, "Alex")).toBeNull();
    expect(profileMatchesName(directory[0], "Alex")).toBe(false);
    expect(profileMatchesName(directory[0], "Grey")).toBe(false);
  });

  it("matches nothing on a blank or unknown name", () => {
    expect(findContributorProfileByAuthorName(profiles, "   ")).toBeNull();
    expect(findContributorProfileByAuthorName(profiles, "Nicole")).toBeNull();
    expect(profileMatchesName(josie, "")).toBe(false);
  });

  it("agrees with the profile-first predicate on every pair", () => {
    for (const name of ["Josie Kins", "josie", "Kaylee", "Alex", "Nicole", ""]) {
      const matched = findContributorProfileByAuthorName(profiles, name);

      for (const profile of profiles) {
        expect(profileMatchesName(profile, name)).toBe(matched?.key === profile.key);
      }
    }
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
