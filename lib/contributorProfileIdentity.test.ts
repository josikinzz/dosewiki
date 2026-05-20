import { describe, expect, it } from "vitest";
import {
  deriveProfileKeyFromEmail,
  findContributorProfileByKeyOrAlias,
  materializeContributorProfile,
  normalizeProfileAliases,
  resolveOwnedProfileKey,
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
