import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

const mocks = vi.hoisted(() => ({
  getServerConvexAdminIntentToken: vi.fn(),
  queryConvex: vi.fn(),
  getPublicDataReadAdapter: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  unstableCache: vi.fn(
    <T extends (...args: never[]) => unknown>(
      fn: T,
      _keyParts?: string[],
      _options?: { tags?: string[] },
    ) => fn,
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: cacheMocks.unstableCache,
}));
vi.mock("./serverWriteHealth", () => ({
  getServerConvexAdminIntentToken: mocks.getServerConvexAdminIntentToken,
}));
vi.mock("./serverClient", () => ({
  queryConvex: mocks.queryConvex,
}));
vi.mock("./publicData.reads", () => ({
  getPublicDataReadAdapter: mocks.getPublicDataReadAdapter,
}));

import {
  collapseContributorProfiles,
  getOwnedContributorProfile,
  getPublicContributorDirectory,
  getPublicContributorProfiles,
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
    cacheMocks.unstableCache.mockClear();
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

  it("serves the whole profile table when every row carries a key-shaped alias", async () => {
    // The shape the live table actually has. Collapsing self-aliases here is what emptied the
    // public contributor reads, so this pins the composed read rather than only the helper.
    mocks.getPublicDataReadAdapter.mockReturnValue({
      getPublicContributorProfiles: vi.fn().mockResolvedValue([
        profile({ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie", "josikinz"] }),
        profile({ key: "KAYTWO", displayName: "Kaytwo", aliases: ["kaytwo", "kaylee"] }),
        profile({ key: "LYREA", displayName: "Lyrea", aliases: ["witchy"] }),
      ]),
    });

    expect((await getPublicContributorProfiles()).map((entry) => entry.key)).toEqual([
      "JOSIE",
      "KAYTWO",
      "LYREA",
    ]);
  });

  it("projects the public contributor directory to key, displayName, and aliases", async () => {
    mocks.getPublicDataReadAdapter.mockReturnValue({
      getPublicContributorProfiles: vi.fn().mockResolvedValue([
        profile({ key: "EDITOR", displayName: "Editor Name", aliases: ["old editor"], bio: "secret bio" }),
      ]),
    });

    const directory = await getPublicContributorDirectory();

    expect(directory).toEqual([
      { key: "EDITOR", displayName: "Editor Name", aliases: ["old editor"] },
    ]);
  });
});
