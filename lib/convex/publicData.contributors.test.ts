import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

const mocks = vi.hoisted(() => ({
  getServerConvexAdminIntentToken: vi.fn(),
  queryConvex: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("./serverWriteHealth", () => ({
  getServerConvexAdminIntentToken: mocks.getServerConvexAdminIntentToken,
}));
vi.mock("./serverClient", () => ({
  queryConvex: mocks.queryConvex,
}));

import {
  collapseContributorProfiles,
  getOwnedContributorProfile,
  resolveContributorProfile,
} from "./publicData.contributors";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("uses the scoped profile token for owned-profile lookups", async () => {
    mocks.getServerConvexAdminIntentToken.mockReturnValue("profile-token");
    mocks.queryConvex.mockResolvedValue(profile({}));

    await getOwnedContributorProfile("editor@example.com");

    expect(mocks.getServerConvexAdminIntentToken).toHaveBeenCalledWith("profileMediaWrite");
    expect(mocks.queryConvex).toHaveBeenCalledWith("contributorProfiles:getOwnedProfile", {
      apiKey: "profile-token",
      email: "editor@example.com",
    });
  });
});
