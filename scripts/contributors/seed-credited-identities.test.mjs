import { describe, expect, it } from "vitest";

import {
  ABSENCE_MARKERS,
  NOTABLE_THIRD_PARTIES,
  blockedReason,
  buildCorrectionIndex,
  buildSeedPlan,
  collectCreditedIdentities,
  deriveProfileKey,
  findCollisions,
  linkIdentity,
  loadIdentityCorrections,
  planProfileLinks,
} from "./seed-credited-identities.mjs";
import {
  CORRECTIONS,
  LIVE_PROFILES,
  NO_CORRECTIONS,
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

describe("planProfileLinks with a correction", () => {
  const correction = CORRECTIONS.linkCorrections[0];

  it("puts the curated link first, so the three-link cap bites the per-work URLs", () => {
    const { links, added } = planProfileLinks(
      [
        { url: "https://vimeo.com/41806282", count: 1 },
        { url: "https://vimeo.com/171672516", count: 1 },
        { url: "https://vimeo.com/102671169", count: 1 },
      ],
      { correction },
    );

    expect(links[0]).toEqual({ label: "vimeo.com", url: "https://vimeo.com/maraquillon" });
    expect(added).toHaveLength(2);
  });

  it("reports a removal with the reason the review recorded, not the parser's", () => {
    const { links, removed, dropped } = planProfileLinks(
      [
        { url: "http://www.sablerook.example/", count: 4 },
        { url: "https://www.printhouse.example/products/the-lattice-by-mara-quill", count: 1 },
      ],
      {
        correction: {
          remove: [...CORRECTIONS.linkCorrections[1].remove, ...correction.remove],
        },
      },
    );

    expect(links).toEqual([]);
    // Matched despite the trailing slash, and reported as a review decision
    // rather than falling through to the generic http-host rejection.
    expect(removed.map((entry) => entry.url)).toEqual([
      "http://www.sablerook.example/",
      "https://www.printhouse.example/products/the-lattice-by-mara-quill",
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

describe("buildCorrectionIndex", () => {
  const index = buildCorrectionIndex(CORRECTIONS);

  it("applies only strong entries and keeps the rest for the report", () => {
    expect([...index.names.keys()]).toEqual(["mara quill", "torvik", "ines halloway"]);
    expect([...index.links.keys()]).toEqual(["mara quill", "sable rook"]);
    expect(index.inertNames.map((entry) => entry.stored)).toEqual(["Pell Drayton"]);
    expect(index.inertLinks.map((entry) => entry.artist)).toEqual(["Tam Vesper"]);
    expect(index.ownerDecisions.map((entry) => entry.subject)).toEqual(["Tam Vesper"]);
  });

  it("blocks a URL by exact identity and a host by name, www or not", () => {
    expect(blockedReason("http://maraquillon.example", index)).toMatch(/parking page/);
    expect(blockedReason("https://www.gfycat.com/anything", index)).toMatch(/shut down/);
    expect(blockedReason("https://vimeo.com/maraquillon", index)).toBeNull();
  });

  it("treats scheme and a trailing slash as noise when matching a URL", () => {
    expect(linkIdentity("http://www.sablerook.example/")).toBe(linkIdentity("https://www.sablerook.example"));
    // ...but not a query string, so a removal catches exactly what it names.
    expect(linkIdentity("https://www.instagram.com/sablerook/?hl=en")).not.toBe(
      linkIdentity("https://www.instagram.com/sablerook/"),
    );
  });

  it("refuses to run without a corrections file rather than planning from none", () => {
    expect(() => loadIdentityCorrections(undefined)).toThrow(/--corrections=<path>/);
  });
});

describe("buildSeedPlan applying the corrections", () => {
  const CORPUS = {
    profiles: [],
    replications: [
      replication("Mara Quill", { artist_url: "https://vimeo.com/41806282" }),
      replication("Mara Quill", {
        artist_url: "https://www.printhouse.example/products/the-lattice-by-mara-quill",
      }),
      replication("TOrvik", { artist_url: "https://www.deviantart.com/torvik" }),
      replication("Sable Rook", { artist_url: "http://www.sablerook.example/" }),
      replication("Sable Rook", { artist_url: "https://www.instagram.com/sablerook/?hl=en" }),
      replication("Pell Drayton", { artist_url: "https://gfycat.com/@pelldrayton/gifs" }),
    ],
    reports: [],
    corrections: CORRECTIONS,
  };

  const plan = buildSeedPlan(CORPUS);
  const created = new Map(plan.created.map((row) => [row.key, row]));

  it("renames the profile and keys it on the corrected spelling", () => {
    expect(created.get("MARAQUILLON").displayName).toBe("Mara Quillon");
    expect(created.get("TORVIK").displayName).toBe("Torvik");
    expect(created.has("PELLDRAYTON")).toBe(true);
  });

  it("answers to both spellings, so it matches the corpus before and after the rows move", () => {
    // Exact whole-name matching means a profile that knows only the corrected
    // spelling credits nothing until the rows are fixed, and one that knows only
    // the stored spelling stops crediting anything the moment they are.
    expect(created.get("MARAQUILLON").aliases).toEqual(["mara quill", "mara quillon"]);
    expect(created.get("TORVIK").aliases).toEqual(["torvik"]);
  });

  it("reports each correction with its evidence and its consequence for the rows", () => {
    const applied = plan.nameCorrectionsApplied.map((entry) => [entry.storedAs, entry.correctedTo]);
    expect(applied).toEqual([
      ["Mara Quill", "Mara Quillon"],
      ["TOrvik", "Torvik"],
    ]);
    const mara = plan.nameCorrectionsApplied.find((entry) => entry.correctedTo === "Mara Quillon");
    expect(mara.correctsReplicationArtistField).toBe(true);
    expect(mara.evidence).toMatch(/vimeo\.com\/maraquillon/);
  });

  it("replaces the per-work URL with the artist's own home", () => {
    expect(created.get("MARAQUILLON").links).toEqual([
      { label: "vimeo.com", url: "https://vimeo.com/maraquillon" },
      { label: "instagram.com", url: "https://www.instagram.com/maraquillonart/" },
    ]);
  });

  it("leaves a profile with no links rather than publishing a dead or unattributable one", () => {
    expect(created.get("SABLEROOK").links).toEqual([]);
  });

  it("surfaces a planned link the blocklist forbids, so the run can fail closed", () => {
    expect(plan.blockedLinks).toEqual([
      {
        key: "PELLDRAYTON",
        displayName: "Pell Drayton",
        url: "https://gfycat.com/@pelldrayton/gifs",
        reason: "shut down 2023; every path 404s",
      },
    ]);
  });

  it("names every correction that matched nothing, so a typo cannot go quiet", () => {
    const unmatched = plan.unmatchedCorrections.map((entry) => entry.name);
    expect(unmatched).toContain("ines halloway");
    expect(unmatched).not.toContain("mara quill");
  });

  it("derives the stored spelling untouched when corrections are switched off", () => {
    const bare = buildSeedPlan({ ...CORPUS, corrections: NO_CORRECTIONS });
    const bareKeys = new Map(bare.created.map((row) => [row.key, row]));

    expect(bareKeys.get("MARAQUILL").displayName).toBe("Mara Quill");
    expect(bare.nameCorrectionsApplied).toEqual([]);
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
      replication("Mara Quill", { artist_url: "https://vimeo.com/41806282" }),
    ],
    reports: [
      ...Array.from({ length: 22 }, () => report("Anonymous")),
      report("froggie"),
      report("Lyrea"),
    ],
    corrections: CORRECTIONS,
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
    expect(created.get("MARAQUILLON").role).toBe("Replication Artist");
    expect(created.has("MARAQUILL")).toBe(false);
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
      created: [{ key: "OLDHANDLE", aliases: ["oldhandle"] }],
      profiles: LIVE_PROFILES,
    });

    expect(collisions.keyShadowedByAlias).toEqual(["OLDHANDLE"]);
  });
});
