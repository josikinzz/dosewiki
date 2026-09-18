import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki_test");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  queryData: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryData: mocks.queryData,
}));

const contributor = (
  overrides: { key: string; displayName: string; aliases?: string[] },
): NormalizedUserProfile => ({
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
  ...overrides,
});

const effect = (slug: string, name: string, contributors?: string[]) => ({
  slug,
  name,
  summary: "",
  tags: [],
  description_raw: "",
  ...(contributors ? { contributors } : {}),
});

/**
 * The credit spellings are the ones production actually carries on
 * `subjectiveEffects.contributors[]`, including the `Josie`/`josie` case split
 * and the names that belong to no profile at all.
 */
const CORPUS = [
  effect("visual-drifting", "Visual drifting", ["Josie", "Kaylee", "liv"]),
  effect("geometry", "Geometry", ["josie", "Gabriel"]),
  effect("acuity-enhancement", "Acuity enhancement", ["Kaylee"]),
  effect("brightness-alteration", "Brightness alteration", ["Viscid"]),
  effect("time-distortion", "Time distortion", []),
  effect("colour-shifting", "Colour shifting"),
];

describe("getEffectArticlesByContributor", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryData.mockReset();
    mocks.queryData.mockResolvedValue(CORPUS);
  });

  it("counts both cases of one name toward a single profile", async () => {
    const { getEffectArticlesByContributor } = await import("./publicData.effects");

    // `Josie` (225 articles on production) and `josie` (2) are the same person.
    // The alias on her profile is what joins them; nothing here lowercases names
    // on its own.
    const credits = await getEffectArticlesByContributor(
      contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie", "josikinz"] }),
    );

    expect(credits).toEqual([
      { slug: "geometry", name: "Geometry" },
      { slug: "visual-drifting", name: "Visual drifting" },
    ]);
  });

  it("resolves a credit spelling that only matches through an alias", async () => {
    const { getEffectArticlesByContributor } = await import("./publicData.effects");

    // Production credits "Kaylee"; the profile is keyed KAYTWO.
    const credits = await getEffectArticlesByContributor(
      contributor({ key: "KAYTWO", displayName: "Kaytwo", aliases: ["kaylee"] }),
    );

    expect(credits.map((credit) => credit.slug)).toEqual([
      "acuity-enhancement",
      "visual-drifting",
    ]);
  });

  it("returns the one article for a contributor credited once", async () => {
    const { getEffectArticlesByContributor } = await import("./publicData.effects");

    const credits = await getEffectArticlesByContributor(
      contributor({ key: "VISCID", displayName: "Viscid", aliases: ["viscid", "mark gillis"] }),
    );

    expect(credits).toEqual([{ slug: "brightness-alteration", name: "Brightness alteration" }]);
  });

  it("returns nothing for a profile no credit names", async () => {
    const { getEffectArticlesByContributor } = await import("./publicData.effects");

    await expect(
      getEffectArticlesByContributor(contributor({ key: "LYREA", displayName: "Lyrea" })),
    ).resolves.toEqual([]);
  });

  it("matches whole names only, so a given name never claims another's credits", async () => {
    const { getEffectArticlesByContributor } = await import("./publicData.effects");

    // "Gabriel" is credited, but this is a different person whose display name
    // merely starts with it. The removed first-word fallback would have handed
    // them the credit.
    await expect(
      getEffectArticlesByContributor(contributor({ key: "GABRIELB", displayName: "Gabriel Blake" })),
    ).resolves.toEqual([]);
  });

  it("skips the corpus read entirely when a profile carries no matchable name", async () => {
    const { getEffectArticlesByContributor } = await import("./publicData.effects");

    await expect(
      getEffectArticlesByContributor(contributor({ key: "BLANK", displayName: "" })),
    ).resolves.toEqual([]);
    expect(mocks.queryData).not.toHaveBeenCalled();
  });

});
