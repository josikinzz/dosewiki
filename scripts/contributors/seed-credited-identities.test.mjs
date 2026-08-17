import { describe, expect, it } from "vitest";

import {
  ABSENCE_MARKERS,
  NOTABLE_THIRD_PARTIES,
  buildSeedPlan,
  collectCreditedIdentities,
  deriveProfileKey,
  findCollisions,
  planProfileLinks,
} from "./seed-credited-identities.mjs";
import {
  LIVE_PROFILES,
  replication,
  report,
} from "./seed-credited-identities-fixtures.mjs";


describe("collectCreditedIdentities", () => {
  it("folds replications and reports into one identity per name", () => {
    const identities = collectCreditedIdentities({
      replications: [replication("Loka"), replication("Loka"), replication("Phosform")],
      reports: [report("froggie"), report("Loka")],
    });

    expect(identities.map((entry) => [entry.displayName, entry.replications, entry.reports])).toEqual([
      // Most-credited first, then by normalized name so the plan is reproducible.
      ["Loka", 2, 1],
      ["froggie", 0, 1],
      ["Phosform", 1, 0],
    ]);
  });

  it("counts each distinct artist_url and orders them by how often they appear", () => {
    const identities = collectCreditedIdentities({
      replications: [
        replication("Chelsea Morgan", { artist_url: "http://chelseamorganart.co.uk" }),
        replication("Chelsea Morgan", { artist_url: "https://chelseamorganart.co.uk" }),
        replication("Chelsea Morgan", { artist_url: "https://chelseamorganart.co.uk" }),
      ],
    });

    expect(identities[0].urls).toEqual([
      { url: "https://chelseamorganart.co.uk", count: 2 },
      { url: "http://chelseamorganart.co.uk", count: 1 },
    ]);
  });

  it("ignores blank and missing credits rather than inventing an empty identity", () => {
    const identities = collectCreditedIdentities({
      replications: [replication("   "), { slug: "x", effect_slug: "y" }],
      reports: [{ slug: "z", subject: {} }],
    });

    expect(identities).toEqual([]);
  });
});

describe("deriveProfileKey", () => {
  it("derives ASCII handles the way the live keys were derived", () => {
    expect(deriveProfileKey("Cold Wasabi").key).toBe("COLDWASABI");
    expect(deriveProfileKey("/u/HSD_5").key).toBe("UHSD5");
  });

  it("reports the letters a derivation would silently drop", () => {
    // Guard against the lossy fallback rather than the specific name: any
    // non-ASCII display name needs an explicit key, not just this one.
    const { droppedCharacters } = deriveProfileKey("Zdzisław Bęksinski");
    expect(droppedCharacters).toEqual(["ł", "ę"]);
  });

  it("takes the explicit key for Zdzisław Beksiński instead of the lossy derivation", () => {
    const derived = deriveProfileKey("Zdzisław Beksiński");

    expect(derived.key).toBe("ZDZISLAWBEKSINSKI");
    expect(derived.explicit).toBe(true);
    // The derivation this replaces drops both Polish letters and cannot be read
    // back to the name.
    expect("Zdzisław Beksiński".replace(/[^A-Za-z0-9-]/g, "").toUpperCase()).toBe("ZDZISAWBEKSISKI");
  });
});

describe("planProfileLinks", () => {
  it("upgrades http to https only for hosts confirmed to answer over https", () => {
    const { links, upgraded, dropped } = planProfileLinks([
      { url: "http://en.wikipedia.org/wiki/Tame_Impala", count: 1 },
      { url: "http://www.zensages.com/", count: 4 },
    ]);

    expect(links).toEqual([
      { label: "en.wikipedia.org", url: "https://en.wikipedia.org/wiki/Tame_Impala" },
    ]);
    expect(upgraded).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ url: "http://www.zensages.com/", count: 4 });
    expect(dropped[0].reason).toContain("NXDOMAIN");
  });

  it("drops values that are not URLs and says so", () => {
    const { links, dropped } = planProfileLinks([
      { url: "Josie", count: 1 },
      { url: "kaylee", count: 1 },
    ]);

    expect(links).toEqual([]);
    expect(dropped.map((entry) => entry.reason)).toEqual(["not a URL", "not a URL"]);
  });

  it("drops a schemeless URL but hands back the repair for a human to approve", () => {
    const { links, dropped } = planProfileLinks([{ url: "reddit.com/u/wheressuede", count: 3 }]);

    expect(links).toEqual([]);
    expect(dropped[0]).toEqual({
      url: "reddit.com/u/wheressuede",
      count: 3,
      reason: "no URL scheme",
      suggestedRepair: "https://reddit.com/u/wheressuede",
    });
  });

  it("collapses values that differ only by scheme or trailing slash", () => {
    const { links } = planProfileLinks([
      { url: "https://www.reddit.com/user/cold-wasabi", count: 4 },
      { url: "https://www.reddit.com/user/cold-wasabi/", count: 1 },
      { url: "http://chelseamorganart.co.uk", count: 4 },
      { url: "https://chelseamorganart.co.uk", count: 16 },
    ]);

    expect(links).toEqual([
      { label: "reddit.com", url: "https://www.reddit.com/user/cold-wasabi" },
      { label: "chelseamorganart.co.uk", url: "https://chelseamorganart.co.uk/" },
    ]);
  });

  it("stops at the three links the mutation keeps and reports the overflow", () => {
    const { links, truncated } = planProfileLinks(
      [1, 2, 3, 4, 5].map((n) => ({ url: `https://vimeo.com/${n}`, count: 1 })),
    );

    expect(links).toHaveLength(3);
    expect(truncated.map((entry) => entry.url)).toEqual([
      "https://vimeo.com/4",
      "https://vimeo.com/5",
    ]);
  });
});

describe("buildSeedPlan", () => {
  const CORPUS = {
    profiles: LIVE_PROFILES,
    replications: [
      ...Array.from({ length: 60 }, () => replication("Symmetric Vision")),
      replication("pluralist visuals"),
      ...Array.from({ length: 20 }, () => replication("Unknown")),
      replication("midjourney"),
      replication("various artists"),
      replication("Zdzisław Beksiński", {
        artist_url: "http://en.wikipedia.org/wiki/Zdzis%C5%82aw_Beksi%C5%84ski",
      }),
      replication("Phosform"),
      replication("Chelsea Morgan", { artist_url: "https://chelseamorganart.co.uk" }),
      replication("Ben Ridgeway", { artist_url: "https://vimeo.com/41806282" }),
    ],
    reports: [
      ...Array.from({ length: 22 }, () => report("Anonymous")),
      report("froggie"),
      report("Lyrea"),
    ],
  };

  const plan = buildSeedPlan(CORPUS);
  const created = new Map(plan.created.map((row) => [row.key, row]));

  it("keeps Symmetric Vision's sixty works on StingrayZ instead of splitting them off", () => {
    // The whole point of the alias pass: the largest artist in the corpus must
    // not end up as two identities that each look minor.
    expect(created.has("SYMMETRICVISION")).toBe(false);
    const addition = plan.aliasAdditions.find((entry) => entry.key === "STINGRAYZ");
    expect(addition.aliases).toEqual(["symmetric vision"]);
    expect(addition.claims.replications).toBe(60);
    expect(addition.alreadyPresent).toBe(false);
  });

  it("routes pluralist visuals to Rho and records Lyrea's own name", () => {
    expect(created.has("PLURALISTVISUALS")).toBe(false);
    expect(plan.aliasAdditions.find((entry) => entry.key === "RHO").claims.replications).toBe(1);
    expect(plan.aliasAdditions.find((entry) => entry.key === "LYREA").aliases).toEqual(["lyrea"]);
  });

  it("creates no profile for an absence marker", () => {
    expect(plan.absenceMarkers.map((entry) => entry.displayName).sort()).toEqual([
      "Anonymous",
      "Unknown",
      "midjourney",
      "various artists",
    ]);
    for (const marker of ABSENCE_MARKERS) {
      expect(plan.created.some((row) => row.displayName === marker)).toBe(false);
    }
  });

  it("seeds every identity on the same terms, third parties included", () => {
    // The owner's ruling: "just give them their own profile pages like anyone
    // else". Every row has the same fields, the only optional one being the
    // title, which one rule assigns to everybody who replicated something.
    const shapes = new Set(
      plan.created.map((row) =>
        Object.keys(row)
          .filter((field) => field !== "role")
          .sort()
          .join(","),
      ),
    );
    expect(shapes.size).toBe(1);
    // Nothing that could sort a person into a lesser tier.
    expect([...shapes][0]).not.toMatch(/kind|attribution|unresolved|tier/);
    expect(created.get("ZDZISLAWBEKSINSKI")).toBeDefined();
    expect(created.get("ZDZISLAWBEKSINSKI").role).toBe("Replication Artist");
    expect(created.get("PHOSFORM").role).toBe("Replication Artist");
    expect(created.get("CHELSEAMORGAN").role).toBe("Replication Artist");
    // Keyed on the corrected spelling, not the stored one.
    expect(created.get("BENRIDGWAY").role).toBe("Replication Artist");
    expect(created.has("BENRIDGEWAY")).toBe(false);
  });

  it("titles a name credited on a replication and nobody else", () => {
    // froggie authored twelve reports and replicated nothing.
    expect(created.get("FROGGIE").role).toBeUndefined();
  });

  it("annotates the notable third parties for the report without changing the row", () => {
    expect(created.get("ZDZISLAWBEKSINSKI").notableThirdParty).toBe(true);
    expect(created.get("PHOSFORM").notableThirdParty).toBe(false);
    for (const name of NOTABLE_THIRD_PARTIES) {
      const row = plan.created.find((entry) => entry.displayName === name);
      if (row) {
        expect(row.notableThirdParty).toBe(true);
      }
    }
  });

  it("folds artist_url into links, upgrading the Wikipedia URL", () => {
    expect(created.get("ZDZISLAWBEKSINSKI").links).toEqual([
      {
        label: "en.wikipedia.org",
        url: "https://en.wikipedia.org/wiki/Zdzis%C5%82aw_Beksi%C5%84ski",
      },
    ]);
  });

  it("finds no collisions in the live corpus", () => {
    expect(plan.collisions).toEqual({
      duplicateKeys: [],
      keyMatchesExistingProfile: [],
      keyShadowedByAlias: [],
      aliasClaimsExistingName: [],
    });
  });

  it("flags a proposed key that an existing alias would hide", () => {
    // The public read drops any profile whose key equals another profile's
    // alias, so such a page would exist and never render.
    const collisions = findCollisions({
      created: [{ key: "WITCHY", aliases: ["witchy"] }],
      profiles: LIVE_PROFILES,
    });

    expect(collisions.keyShadowedByAlias).toEqual(["WITCHY"]);
  });
});
