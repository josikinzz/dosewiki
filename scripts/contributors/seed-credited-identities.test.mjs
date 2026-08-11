import { describe, expect, it } from "vitest";

import {
  ABSENCE_MARKERS,
  NOTABLE_THIRD_PARTIES,
  blockedReason,
  buildCorrectionIndex,
  buildImportEntries,
  buildSeedPlan,
  collectCreditedIdentities,
  countPageReferences,
  deriveProfileKey,
  findCollisions,
  linkIdentity,
  loadIdentityCorrections,
  mergeWithStoredProfile,
  planProfileLinks,
  previewRosterImpact,
} from "./seed-credited-identities.mjs";

/** The reviewed corrections dataset the script actually ships with. */
const CORRECTIONS = loadIdentityCorrections();

/** Corrections switched off, for the tests that are about the derivation itself. */
const NO_CORRECTIONS = {
  nameCorrections: [],
  linkCorrections: [],
  blockedUrls: [],
  blockedHosts: [],
  ownerDecisions: [],
  checkedAndFoundWrong: [],
};

/** Shapes and spellings lifted from the live production rows. */
const replication = (artist, overrides = {}) => ({
  slug: `${artist}-work`,
  effect_slug: "geometry",
  artist,
  ...overrides,
});

const report = (name) => ({ slug: `${name}-report`, subject: { name } });

const profile = (key, displayName, overrides = {}) => ({
  key,
  displayName,
  aliases: [],
  bio: "",
  links: [],
  ...overrides,
});

const STINGRAYZ = profile("STINGRAYZ", "StingrayZ", {
  aliases: ["stingrayz"],
  bio: "SOCIAL MEDIA\nfacebook.com/symmetryinvisioned",
});
const RHO = profile("RHO", "Rho", {
  aliases: ["rho"],
  bio: "Instagram - instagram.com/pluralist.visuals",
  role: "Replication Artist",
});
const LYREA = profile("LYREA", "Lyrea", { aliases: ["witchy"] });
const LIVE_PROFILES = [STINGRAYZ, RHO, LYREA];

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

/**
 * The corrections dataset is the reviewable artifact, so it is tested as data:
 * the claims it makes, the guarantee that only `strong` acts, and the guarantee
 * that a URL on the blocked list cannot reach a profile whatever else happens.
 */
describe("contributorIdentityCorrections.json", () => {
  const index = buildCorrectionIndex(CORRECTIONS);

  it("carries evidence and a strength marker on every entry", () => {
    for (const entry of CORRECTIONS.nameCorrections) {
      expect(entry.strength, entry.stored).toMatch(/^(strong|weak|needs-owner)$/);
      expect(entry.evidence, entry.stored).toBeTruthy();
    }
    for (const entry of CORRECTIONS.linkCorrections) {
      expect(entry.strength, entry.artist).toMatch(/^(strong|weak|needs-owner)$/);
      for (const added of entry.add ?? []) {
        expect(added.evidence, added.url).toBeTruthy();
        expect(added.verification, added.url).toBeTruthy();
      }
      for (const removed of entry.remove ?? []) {
        expect(removed.reason, removed.url).toBeTruthy();
      }
    }
    for (const decision of CORRECTIONS.ownerDecisions) {
      expect(decision.whyNotApplied, decision.subject).toBeTruthy();
    }
  });

  it("holds the five name corrections, all strong, all applying to the rows too", () => {
    expect(
      CORRECTIONS.nameCorrections.map((entry) => [entry.stored, entry.correct, entry.strength]),
    ).toEqual([
      ["Ben Ridgeway", "Ben Ridgway", "strong"],
      ["Simon Haid", "Simon Haiduk", "strong"],
      ["Insedigris", "Incedigris", "strong"],
      ["MOracs", "MOracz", "strong"],
      ["Sam perkins", "Sam Perkins", "strong"],
    ]);
    for (const entry of CORRECTIONS.nameCorrections) {
      // The name lives on replications.artist as well as on the profile, and a
      // profile fixed alone is a profile that disagrees with every gallery tile.
      expect(entry.correctsReplicationArtistField, entry.stored).toBe(true);
    }
  });

  it("never proposes adding a URL it also blocks", () => {
    for (const entry of CORRECTIONS.linkCorrections) {
      for (const added of entry.add ?? []) {
        expect(blockedReason(added.url, index), `${entry.artist} -> ${added.url}`).toBeNull();
      }
    }
  });

  it("recognises the three traps that answer 200 and belong to somebody else", () => {
    expect(blockedReason("https://benridgway.com/", index)).toMatch(/parking/i);
    expect(blockedReason("https://neilusher.com/", index)).toMatch(/estate agent/i);
    expect(blockedReason("https://en.wikipedia.org/wiki/Luke_Brown", index)).toMatch(/wrestler/i);
  });

  it("blocks gfycat by host, since the shutdown killed every path on it", () => {
    expect(blockedReason("https://gfycat.com/@jumproper/gifs", index)).toMatch(/shut down/i);
    expect(blockedReason("https://gfycat.com/@UONVISUALS", index)).toMatch(/shut down/i);
    expect(blockedReason("https://www.gfycat.com/anything", index)).toMatch(/shut down/i);
  });

  it("keeps weak and needs-owner entries out of the applied index", () => {
    const applied = new Set([...index.names.keys(), ...index.links.keys()]);
    for (const entry of [...index.inertNames, ...index.inertLinks]) {
      expect(entry.strength).not.toBe("strong");
    }
    // The four the owner has to settle are named and none of them is applied.
    const subjects = CORRECTIONS.ownerDecisions.map((decision) => decision.subject);
    expect(subjects).toEqual(
      expect.arrayContaining(["k visuals", "thatswissengineer", "Neil Usher", "Loka"]),
    );
    expect(applied.has("k visuals")).toBe(false);
    expect(applied.has("thatswissengineer")).toBe(false);
    expect(applied.has("loka")).toBe(false);
  });

  it("treats scheme and a trailing slash as noise when matching a URL", () => {
    expect(linkIdentity("http://www.zensages.com/")).toBe(linkIdentity("https://www.zensages.com"));
    // ...but not a query string, so a removal catches exactly what it names.
    expect(linkIdentity("https://www.instagram.com/salviadroid/?hl=en")).not.toBe(
      linkIdentity("https://www.instagram.com/salviadroid/"),
    );
  });
});

describe("planProfileLinks with a correction", () => {
  const correction = {
    add: [
      { url: "https://vimeo.com/benridgway", evidence: "his own channel", verification: "live-200" },
    ],
    remove: [
      { url: "https://www.threyda.com/products/the-answers-lie-within-by-ben-ridgway", reason: "404" },
    ],
  };

  it("puts the curated link first, so the three-link cap bites the per-work URLs", () => {
    const { links, added } = planProfileLinks(
      [
        { url: "https://vimeo.com/41806282", count: 1 },
        { url: "https://vimeo.com/171672516", count: 1 },
        { url: "https://vimeo.com/102671169", count: 1 },
      ],
      { correction },
    );

    expect(links[0]).toEqual({ label: "vimeo.com", url: "https://vimeo.com/benridgway" });
    expect(added).toHaveLength(1);
  });

  it("reports a removal with the reason the review recorded, not the parser's", () => {
    const { links, removed, dropped } = planProfileLinks(
      [
        { url: "http://www.zensages.com/", count: 4 },
        { url: "https://www.threyda.com/products/the-answers-lie-within-by-ben-ridgway", count: 1 },
      ],
      {
        correction: {
          remove: [
            { url: "http://www.zensages.com", reason: "NXDOMAIN; was the artist's own site until 2021" },
            ...correction.remove,
          ],
        },
      },
    );

    expect(links).toEqual([]);
    // Matched despite the trailing slash, and reported as a review decision
    // rather than falling through to the generic http-host rejection.
    expect(removed.map((entry) => entry.url)).toEqual([
      "http://www.zensages.com/",
      "https://www.threyda.com/products/the-answers-lie-within-by-ben-ridgway",
    ]);
    expect(removed[0].reason).toMatch(/artist's own site/);
    expect(dropped).toEqual([]);
  });

  it("refuses a correction that supplies a non-https link rather than upgrading it", () => {
    const { links, dropped } = planProfileLinks([], {
      correction: { add: [{ url: "http://example.com/", evidence: "x", verification: "y" }] },
    });

    expect(links).toEqual([]);
    expect(dropped[0].reason).toMatch(/not an https URL/);
  });
});

describe("buildSeedPlan applying the corrections", () => {
  const CORPUS = {
    profiles: [],
    replications: [
      replication("Ben Ridgeway", { artist_url: "https://vimeo.com/41806282" }),
      replication("Ben Ridgeway", {
        artist_url: "https://www.threyda.com/products/the-answers-lie-within-by-ben-ridgway",
      }),
      replication("MOracs", { artist_url: "http://waruzimu.deviantart.com/art/Hatheg-Kla-220753288" }),
      replication("SalviaDroid", { artist_url: "http://www.zensages.com/" }),
      replication("SalviaDroid", { artist_url: "https://www.instagram.com/salviadroid/?hl=en" }),
      replication("Jumproper", { artist_url: "https://gfycat.com/@jumproper/gifs" }),
      replication("Alex Grey"),
    ],
    reports: [],
  };

  const plan = buildSeedPlan(CORPUS);
  const created = new Map(plan.created.map((row) => [row.key, row]));

  it("renames the profile and keys it on the corrected spelling", () => {
    expect(created.get("BENRIDGWAY").displayName).toBe("Ben Ridgway");
    expect(created.get("MORACZ").displayName).toBe("MOracz");
  });

  it("answers to both spellings, so it matches the corpus before and after the rows move", () => {
    // Exact whole-name matching means a profile that knows only the corrected
    // spelling credits nothing until the rows are fixed, and one that knows only
    // the stored spelling stops crediting anything the moment they are.
    expect(created.get("BENRIDGWAY").aliases).toEqual(["ben ridgeway", "ben ridgway"]);
    expect(created.get("MORACZ").aliases).toEqual(["moracs", "moracz"]);
  });

  it("reports each correction with its evidence and its consequence for the rows", () => {
    const applied = plan.nameCorrectionsApplied.map((entry) => [entry.storedAs, entry.correctedTo]);
    expect(applied).toEqual([
      ["Ben Ridgeway", "Ben Ridgway"],
      ["MOracs", "MOracz"],
    ]);
    expect(plan.nameCorrectionsApplied[0].correctsReplicationArtistField).toBe(true);
    expect(plan.nameCorrectionsApplied[0].evidence).toMatch(/vimeo\.com\/benridgway/);
  });

  it("replaces the per-work URL with the artist's own home", () => {
    expect(created.get("BENRIDGWAY").links).toEqual([
      { label: "vimeo.com", url: "https://vimeo.com/benridgway" },
      { label: "instagram.com", url: "https://www.instagram.com/benridgwayart/" },
    ]);
    expect(created.get("MORACZ").links).toEqual([
      { label: "deviantart.com", url: "https://www.deviantart.com/moracz" },
    ]);
    expect(created.get("ALEXGREY").links.map((link) => link.url)).toEqual([
      "https://www.alexgrey.com/",
      "https://en.wikipedia.org/wiki/Alex_Grey",
    ]);
  });

  it("leaves a profile with no links rather than publishing a dead or unattributable one", () => {
    // Seven works in production and nothing survives review: zensages.com is
    // gone and the obvious Instagram handle is private and unattributed.
    expect(created.get("SALVIADROID").links).toEqual([]);
    expect(created.get("JUMPROPER").links).toEqual([]);
  });

  it("lets no blocked URL reach a planned profile", () => {
    expect(plan.blockedLinks).toEqual([]);
  });

  it("names every correction that matched nothing, so a typo cannot go quiet", () => {
    const unmatched = plan.unmatchedCorrections.map((entry) => entry.name);
    expect(unmatched).toContain("simon haid");
    expect(unmatched).not.toContain("ben ridgeway");
  });

  it("derives the stored spelling untouched when corrections are switched off", () => {
    const bare = buildSeedPlan({ ...CORPUS, corrections: NO_CORRECTIONS });
    const bareKeys = new Map(bare.created.map((row) => [row.key, row]));

    expect(bareKeys.get("BENRIDGEWAY").displayName).toBe("Ben Ridgeway");
    expect(bare.nameCorrectionsApplied).toEqual([]);
  });
});

describe("mergeWithStoredProfile", () => {
  const planned = {
    key: "PHOSFORM",
    displayName: "Phosform",
    aliases: ["phosform"],
    bio: "",
    role: "Replication Artist",
    links: [{ label: "example.com", url: "https://example.com/" }],
  };

  it("creates a row when nothing is stored", () => {
    expect(mergeWithStoredProfile(planned, undefined).action).toBe("create");
  });

  it("never clobbers a bio, a title or curated links", () => {
    const stored = {
      key: "PHOSFORM",
      displayName: "Phosform",
      aliases: ["phosform"],
      bio: "A bio somebody wrote by hand.",
      role: "Founder",
      links: [{ label: "curated", url: "https://curated.example/" }],
      avatarStorageId: "kg2abc",
      membershipEmail: "phosform@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const { entry, action } = mergeWithStoredProfile(planned, stored);

    expect(action).toBe("unchanged");
    expect(entry.bio).toBe("A bio somebody wrote by hand.");
    expect(entry.role).toBe("Founder");
    expect(entry.links).toEqual(stored.links);
    // bulkImport patches every field it is given, so the fields the public read
    // cannot see have to survive the merge or they are cleared.
    expect(entry.avatarStorageId).toBe("kg2abc");
    expect(entry.membershipEmail).toBe("phosform@example.com");
    expect(entry.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("adds aliases without removing the stored ones", () => {
    const { entry, action, changedFields } = mergeWithStoredProfile(
      { ...planned, key: "STINGRAYZ", aliases: ["symmetric vision"] },
      { key: "STINGRAYZ", displayName: "StingrayZ", aliases: ["stingrayz"], bio: "x", links: [] },
    );

    expect(action).toBe("update");
    expect(changedFields).toContain("aliases");
    expect(entry.aliases).toEqual(["stingrayz", "symmetric vision"]);
  });

  it("is a no-op on a second run", () => {
    const first = mergeWithStoredProfile(planned, undefined);
    const second = mergeWithStoredProfile(planned, {
      ...first.entry,
      // What Convex hands back after the first write.
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(second.action).toBe("unchanged");
    expect(second.changedFields).toEqual([]);
  });
});

describe("buildImportEntries", () => {
  it("writes the alias additions before any new row", () => {
    const plan = buildSeedPlan({
      profiles: LIVE_PROFILES,
      replications: [replication("Symmetric Vision"), replication("Phosform")],
      reports: [],
    });

    const entries = buildImportEntries(
      plan,
      new Map(LIVE_PROFILES.map((entry) => [entry.key, entry])),
    );

    expect(entries[0].reason).toBe("alias addition");
    expect(entries.at(-1).reason).toBe("credited identity");
    expect(entries.map((entry) => entry.entry.key)).toContain("PHOSFORM");
  });

  it("carries no key the plan did not produce", () => {
    const plan = buildSeedPlan({ profiles: LIVE_PROFILES, replications: [], reports: [] });
    const entries = buildImportEntries(plan, new Map(LIVE_PROFILES.map((e) => [e.key, e])));

    expect(entries.every((entry) => typeof entry.entry.key === "string" && entry.entry.key.length > 0)).toBe(true);
  });
});

describe("possible merges", () => {
  it("gives a thin-evidence merge candidate its own profile and reports it", () => {
    const plan = buildSeedPlan({
      profiles: [...LIVE_PROFILES, profile("NATALIE", "Natalie", { aliases: ["natalie"] })],
      replications: [],
      reports: [report("BluuRae"), report("Pluralist-Art")],
    });

    // Created, not aliased: an alias applied on a hunch credits one person's
    // work to another, and that is the harder mistake to notice.
    expect(plan.created.map((row) => row.key)).toEqual(
      expect.arrayContaining(["BLUURAE", "PLURALIST-ART"]),
    );
    expect(plan.possibleMerges.map((entry) => [entry.key, entry.candidateKey])).toEqual([
      ["BLUURAE", "NATALIE"],
      ["PLURALIST-ART", "RHO"],
    ]);
  });
});

/**
 * The roster preview is the part of the run a human is meant to act on, so it is
 * tested like an output the owner will trust: exact before, exact after, exact
 * list of names that newly appear.
 */
describe("previewRosterImpact", () => {
  const profiles = [
    profile("JOSIE", "Josie Kins", { aliases: ["josie", "josie kins"] }),
    profile("STINGRAYZ", "StingrayZ", { aliases: ["stingrayz"] }),
    profile("LYREA", "Lyrea", { aliases: ["witchy"] }),
  ];

  const corpus = {
    profiles,
    replications: [
      { slug: "a", effect_slug: "geometry", artist: "Symmetric Vision" },
      { slug: "b", effect_slug: "tracers", artist: "Symmetric Vision" },
      { slug: "c", effect_slug: "drifting", artist: "Phosform" },
      { slug: "d", effect_slug: "drifting", artist: "Zdzisław Beksiński" },
    ],
    reports: [{ slug: "r1", subject: { name: "froggie" } }],
  };
  const effects = [
    { slug: "geometry", contributors: ["Josie"] },
    { slug: "tracers", contributors: [] },
    { slug: "drifting", contributors: [] },
  ];

  const plan = buildSeedPlan(corpus);
  const roster = previewRosterImpact({ ...corpus, plan, effects });

  it("counts the roster today without the import", () => {
    // Lyrea is excluded from the Effect Index roster by key, as she is today.
    expect(roster.before.map((entry) => entry.key)).toEqual(["JOSIE", "STINGRAYZ"]);
    // StingrayZ currently matches nothing: the sixty "Symmetric Vision" works
    // are the whole point of the alias merge.
    expect(roster.before.find((entry) => entry.key === "STINGRAYZ").referenceCount).toBe(0);
  });

  it("names every profile that newly appears, in the position it would take", () => {
    expect(roster.added.map((entry) => [entry.position, entry.displayName])).toEqual([
      // One page each, so they tie and sort by display name, exactly as
      // `compareRosterEntries` would order them on the page.
      [3, "froggie"],
      [4, "Phosform"],
      [5, "Zdzisław Beksiński"],
    ]);
    expect(roster.after).toHaveLength(roster.before.length + roster.added.length);
  });

  it("flags the third parties by name, because that is the surprising part", () => {
    expect(
      roster.added.filter((entry) => entry.notableThirdParty).map((entry) => entry.displayName),
    ).toEqual(["Zdzisław Beksiński"]);
  });

  it("shows the credit count the alias merge moves", () => {
    expect(roster.movedByAlias.map((entry) => [entry.displayName, entry.wasReferenceCount, entry.referenceCount])).toEqual([
      ["StingrayZ", 0, 2],
    ]);
  });

  it("counts one page once however many times it names the same person", () => {
    const counts = countPageReferences(
      [{ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] }],
      {
        effects: [{ slug: "tracers", contributors: ["Josie", "Josie Kins"] }],
        replications: [{ effect_slug: "tracers", artist: "Josie" }],
      },
    );

    expect(counts.get("JOSIE")).toBe(1);
  });
});
