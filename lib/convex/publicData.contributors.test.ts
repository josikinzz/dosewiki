import { describe, expect, it, vi } from "vitest";
import {
  collapseContributorProfiles,
  resolveContributorProfile,
} from "./publicData.contributors";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const profile = (overrides: Partial<NormalizedUserProfile>): NormalizedUserProfile => ({
  key: "EDITOR",
  displayName: "Editor Name",
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
  ...overrides,
});

describe("public contributor profile adapters", () => {
  it("resolves public report authors through materialized profile aliases", () => {
    const profiles = [profile({ aliases: ["old editor", "editor"] })];

    expect(resolveContributorProfile(profiles, "old editor")?.key).toBe("EDITOR");
    expect(resolveContributorProfile(profiles, "Editor")?.key).toBe("EDITOR");
  });

  it("collapses alias entries using the shared key normalization rule", () => {
    const profiles = [
      profile({ key: "EDITOR", aliases: ["old-editor"] }),
      profile({ key: "OLD-EDITOR", displayName: "Old Editor" }),
    ];

    expect(collapseContributorProfiles(profiles).map((entry) => entry.key)).toEqual(["EDITOR"]);
  });
});
