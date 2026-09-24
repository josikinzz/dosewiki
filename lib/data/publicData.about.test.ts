import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki_test");
});
afterEach(() => vi.unstubAllEnvs());

const mocks = vi.hoisted(() => ({
  getPublicAboutConfig: vi.fn(),
  getPublicContributorByKey: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("./publicData.reads", () => ({
  getPublicDataReadAdapter: () => ({ getPublicAboutConfig: mocks.getPublicAboutConfig }),
}));
vi.mock("./publicData.contributors", () => ({
  getPublicContributorByKey: mocks.getPublicContributorByKey,
  getPublicContributorIdentities: vi.fn(async () => []),
}));

import { getPublicTranslationCredits } from "./publicData.about";

const vacue: NormalizedUserProfile & { membershipEmail?: string } = {
  key: "VACUE",
  displayName: "Vacue",
  aliases: ["vacue138950"],
  avatarUrl: null,
  bio: "Bio text",
  links: [{ label: "X", url: "https://x.com/Vacue138950" }],
  hasCustomBio: true,
  membershipEmail: "vacue@example.com",
};

describe("getPublicTranslationCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicContributorByKey.mockImplementation(async (key: string) => (key === "VACUE" ? vacue : null));
  });

  it("resolves a locale's credits to public profile fields only", async () => {
    mocks.getPublicAboutConfig.mockResolvedValue({
      updatedAt: "2026-09-23",
      updatedBy: "admin@example.com",
      translationCredits: {
        "zh-Hans": [
          { profileKey: "VACUE", contribution: "Chinese localization, terminology review, and localization workflow feedback" },
          { profileKey: "MISSING", contribution: "Gone" },
        ],
      },
    });

    const credits = await getPublicTranslationCredits("zh-Hans");

    expect(credits).toEqual([{
      key: "VACUE",
      displayName: "Vacue",
      avatarUrl: null,
      href: "https://x.com/Vacue138950",
      contribution: "Chinese localization, terminology review, and localization workflow feedback",
    }]);
    expect(JSON.stringify(credits)).not.toContain("example.com");
  });

  it("is empty for a locale without credits, a missing column, or no About document", async () => {
    mocks.getPublicAboutConfig.mockResolvedValue({ updatedAt: "2026-09-23", translationCredits: null });
    expect(await getPublicTranslationCredits("ru")).toEqual([]);
    mocks.getPublicAboutConfig.mockResolvedValue(null);
    expect(await getPublicTranslationCredits("zh-Hans")).toEqual([]);
    expect(mocks.getPublicContributorByKey).not.toHaveBeenCalled();
  });
});
