import { describe, expect, it } from "vitest";

import {
  blockedReason,
  buildCorrectionIndex,
  buildSeedPlan,
  linkIdentity,
  planProfileLinks,
} from "./seed-credited-identities.mjs";
import {
  CORRECTIONS,
  NO_CORRECTIONS,
  replication,
} from "./seed-credited-identities-fixtures.mjs";

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

  it("holds the name corrections, all strong, all applying to the rows too", () => {
    // The catalogue grew from the original five research-pass corrections to 26
    // once the casing/rename normalizations landed; the original five must
    // survive, and every entry keeps the strong + rows-too contract.
    const pairs = CORRECTIONS.nameCorrections.map((entry) => [entry.stored, entry.correct]);
    expect(pairs).toEqual(
      expect.arrayContaining([
        ["Ben Ridgeway", "Ben Ridgway"],
        ["Simon Haid", "Simon Haiduk"],
        ["Insedigris", "Incedigris"],
        ["MOracs", "MOracz"],
        ["Sam perkins", "Sam Perkins"],
      ]),
    );
    for (const entry of CORRECTIONS.nameCorrections) {
      expect(entry.strength, entry.stored).toBe("strong");
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
    // The subjects the owner had to settle are all named. Three remain
    // unapplied; Loka's was settled on 2026-08-14 (Loka = LokaVision,
    // https://lokavision.com/) and is now the one ownerDecisions subject that
    // IS applied, via the strong Loka linkCorrections entry.
    const subjects = CORRECTIONS.ownerDecisions.map((decision) => decision.subject);
    expect(subjects).toEqual(
      expect.arrayContaining(["k visuals", "thatswissengineer", "Neil Usher", "Loka"]),
    );
    expect(applied.has("k visuals")).toBe(false);
    expect(applied.has("thatswissengineer")).toBe(false);
    expect(applied.has("loka")).toBe(true);
    expect(index.links.get("loka")?.add?.[0]?.url).toBe("https://lokavision.com/");
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
    // Casing-normalization entries match this corpus's already-correct rows
    // case-insensitively and report as no-op applications; the two real
    // respellings are the ones that must change the rows.
    expect(applied).toEqual([
      ["Ben Ridgeway", "Ben Ridgway"],
      ["SalviaDroid", "SalviaDroid"],
      ["Alex Grey", "Alex Grey"],
      ["MOracs", "MOracz"],
    ]);
    const respellings = plan.nameCorrectionsApplied.filter(
      (entry) => entry.storedAs !== entry.correctedTo,
    );
    expect(respellings.map((entry) => [entry.storedAs, entry.correctedTo])).toEqual([
      ["Ben Ridgeway", "Ben Ridgway"],
      ["MOracs", "MOracz"],
    ]);
    const benRidgway = plan.nameCorrectionsApplied.find(
      (entry) => entry.correctedTo === "Ben Ridgway",
    );
    expect(benRidgway.correctsReplicationArtistField).toBe(true);
    expect(benRidgway.evidence).toMatch(/vimeo\.com\/benridgway/);
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
