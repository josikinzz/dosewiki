import { describe, expect, it } from "vitest";

import featuredReplicationsConfig from "@data/effects/effectIndexFeaturedReplications.json";
import type { GalleryReplication } from "@/types/replications";
import {
  buildReplicationIntroduction,
  formatAuthorLine,
  formatFeaturedArticleDate,
  resolveFeaturedReplications,
  rotateBySeed,
  selectFeaturedArticle,
  selectFeaturedEffectGroups,
  selectFeaturedReports,
  summarizeReportSubstances,
} from "./homeModel";

function replication(overrides: Partial<GalleryReplication>): GalleryReplication {
  return {
    _id: `id-${overrides.slug ?? "x"}`,
    _creationTime: 0,
    slug: "a-slug",
    title: "A Title",
    artist: "StingrayZ",
    type: "video",
    storage_id: "storage",
    effect_slug: "drifting",
    format: "mp4",
    created_at: "2026-01-01T00:00:00.000Z",
    url: "https://example.test/media.mp4",
    ...overrides,
  };
}

describe("the curated featured-replication list", () => {
  const { slugs } = featuredReplicationsConfig;

  it("holds the 36 legacy featured replications that map confidently onto current rows", () => {
    expect(slugs).toHaveLength(36);
  });

  it("has no duplicates and no blank or whitespace-padded entries", () => {
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const slug of slugs) {
      expect(slug).toBe(slug.trim());
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("records why the remaining legacy entries were left out", () => {
    // The list is editorial curation, so the file has to say what it excluded and why —
    // otherwise a later reader cannot tell a decision from an oversight.
    expect(featuredReplicationsConfig.provenance).toMatch(/ambiguous/);
    expect(featuredReplicationsConfig.provenance).toMatch(/unrecoverable/);
  });

  it("resolves against a read of the same slugs, and skips the ones it cannot find", () => {
    const present = slugs.slice(0, 30).map((slug) => replication({ slug }));

    const resolved = resolveFeaturedReplications(slugs, present, new Map(), 0);

    expect(resolved).toHaveLength(30);
    expect(resolved.map((entry) => entry.replication.slug)).toEqual(slugs.slice(0, 30));
  });
});

describe("rotateBySeed", () => {
  it("is a rotation, not a shuffle: every item survives and the order is preserved", () => {
    expect(rotateBySeed([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(rotateBySeed([1, 2, 3, 4], 6)).toEqual([3, 4, 1, 2]);
  });

  it("is total: any seed on any list, including an empty one", () => {
    expect(rotateBySeed([], 7)).toEqual([]);
    expect(rotateBySeed([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(rotateBySeed([1, 2, 3], -1)).toEqual([2, 3, 1]);
  });
});

describe("selectFeaturedEffectGroups", () => {
  const effects = [
    { name: "Colour shifting", slug: "colour-shifting", featured: true, tags: ["visual", "sensory"] },
    { name: "Time distortion", slug: "time-distortion", featured: true, tags: ["Cognitive"] },
    { name: "Machinescapes", slug: "machinescapes", featured: true, tags: ["miscellaneous"] },
    { name: "Not featured", slug: "not-featured", featured: false, tags: ["visual"] },
    { name: "No flag", slug: "no-flag", tags: ["visual"] },
  ];

  it("keeps only featured effects and groups them in the original's order", () => {
    const groups = selectFeaturedEffectGroups(effects);

    expect(groups.map((group) => group.label)).toEqual([
      "Visual Effects",
      "Cognitive Effects",
      "Miscellaneous Effects",
    ]);
    expect(groups[0].effects).toEqual([{ name: "Colour shifting", slug: "colour-shifting" }]);
  });

  it("matches tags case-insensitively", () => {
    const [, cognitive] = selectFeaturedEffectGroups(effects);

    expect(cognitive.effects.map((effect) => effect.slug)).toEqual(["time-distortion"]);
  });

  it("drops a group with no featured effects rather than printing an empty label", () => {
    const groups = selectFeaturedEffectGroups([
      { name: "Colour shifting", slug: "colour-shifting", featured: true, tags: ["visual"] },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("visual");
  });

  it("returns nothing when no effect is featured", () => {
    expect(selectFeaturedEffectGroups([{ name: "A", slug: "a", tags: ["visual"] }])).toEqual([]);
  });
});

describe("formatFeaturedArticleDate", () => {
  it("renders the original's weekday-first mask", () => {
    expect(formatFeaturedArticleDate("2021-04-20")).toBe("Tuesday, April 20 2021");
  });

  it("reads the date in UTC so the prerendered output is timezone-independent", () => {
    expect(formatFeaturedArticleDate("2021-05-08T00:00:00.000Z")).toBe("Saturday, May 8 2021");
  });

  it("returns nothing for a missing or unparseable date", () => {
    expect(formatFeaturedArticleDate(undefined)).toBeUndefined();
    expect(formatFeaturedArticleDate("not a date")).toBeUndefined();
  });
});

describe("formatAuthorLine", () => {
  it("joins names the way the original did", () => {
    expect(formatAuthorLine(["Josie Kins"])).toBe("Josie Kins");
    expect(formatAuthorLine(["Josie Kins", "Nervewing"])).toBe("Josie Kins and Nervewing");
    expect(formatAuthorLine(["A", "B", "C"])).toBe("A, B and C");
  });

  it("drops unresolved legacy Mongo ObjectIds instead of printing them as a byline", () => {
    expect(formatAuthorLine(["60542430198361300fea3610"])).toBeUndefined();
    expect(formatAuthorLine(["60542430198361300fea3610", "Josie Kins"])).toBe("Josie Kins");
  });

  it("returns nothing for an absent or empty author list", () => {
    expect(formatAuthorLine(undefined)).toBeUndefined();
    expect(formatAuthorLine(["  "])).toBeUndefined();
  });
});

describe("selectFeaturedArticle", () => {
  const articles = [
    { slug: "psychedelic-intensity-scale", title: "Psychedelic Intensity Scale", featured: true },
    { slug: "dmt-intensity-scale", title: "DMT Intensity Scale", featured: true },
    { slug: "unflagged", title: "Unflagged", featured: false },
  ];

  it("returns exactly one featured article, chosen by seed", () => {
    expect(selectFeaturedArticle(articles, 0)?.slug).toBe("psychedelic-intensity-scale");
    expect(selectFeaturedArticle(articles, 1)?.slug).toBe("dmt-intensity-scale");
  });

  it("never returns an article that is not flagged featured", () => {
    expect(selectFeaturedArticle([articles[2]], 0)).toBeNull();
  });

  it("degrades to null on an empty set rather than throwing", () => {
    expect(selectFeaturedArticle([], 5)).toBeNull();
  });

  it("carries the display fields the panel renders", () => {
    const article = selectFeaturedArticle(
      [
        {
          slug: "scale",
          title: "Scale",
          featured: true,
          authors: ["Josie Kins"],
          publicationDate: "2021-04-20",
          shortDescription: "  A description.  ",
          body_raw: "word ".repeat(440),
        },
      ],
      0,
      () => "2 min read",
    );

    expect(article).toEqual({
      slug: "scale",
      title: "Scale",
      authorLine: "Josie Kins",
      dateLabel: "Tuesday, April 20 2021",
      readTimeLabel: "2 min read",
      description: "A description.",
    });
  });
});

describe("summarizeReportSubstances", () => {
  it("shows one substance with its dose and route", () => {
    expect(summarizeReportSubstances([{ name: "2C-E", dose: "25mg", roa: "Oral" }])).toEqual({
      substanceName: "2C-E",
      doseLine: "25mg Oral",
    });
  });

  it("collapses several substances to the original's Combination label", () => {
    expect(
      summarizeReportSubstances([{ name: "LSD", dose: "1 tab" }, { name: "MDMA" }]),
    ).toEqual({ substanceName: "Combination", doseLine: "" });
  });

  it("leaves both fields empty when no substance is recorded", () => {
    expect(summarizeReportSubstances([])).toEqual({ substanceName: "", doseLine: "" });
  });
});

describe("selectFeaturedReports", () => {
  const reports = Array.from({ length: 12 }, (_, index) => ({
    slug: `report-${index}`,
    title: `Report ${index}`,
    author: "Josie",
    featured: index < 10,
    substances: [{ name: "LSD", dose: "100ug", roa: "Oral" }],
  }));

  it("caps the panel at the original's eight reports", () => {
    expect(selectFeaturedReports(reports, 0)).toHaveLength(8);
  });

  it("only lists featured reports", () => {
    const slugs = selectFeaturedReports(reports, 0, 20).map((report) => report.slug);

    expect(slugs).toHaveLength(10);
    expect(slugs).not.toContain("report-10");
  });

  it("returns an empty list when nothing is featured", () => {
    expect(selectFeaturedReports([], 3)).toEqual([]);
  });
});

describe("buildReplicationIntroduction", () => {
  it("uses 'an' before a vowel, covering the original's three-name exception list", () => {
    for (const name of ["Autonomous entity", "Internal hallucination", "External hallucination"]) {
      expect(buildReplicationIntroduction(name)).toBe("A replication of an ");
    }
  });

  it("uses the plain form otherwise", () => {
    expect(buildReplicationIntroduction("Geometry")).toBe("A replication of ");
    expect(buildReplicationIntroduction(" Drifting")).toBe("A replication of ");
  });
});

describe("resolveFeaturedReplications", () => {
  const replications = [
    replication({ slug: "geometry-frog-stingrayz", effect_slug: "geometry" }),
    replication({ slug: "snek-stingrayz", effect_slug: "drifting" }),
    replication({ slug: "no-media-stingrayz", effect_slug: "drifting", url: "" }),
  ];
  const effectNames = new Map([
    ["geometry", "Geometry"],
    ["drifting", "Drifting"],
  ]);

  it("resolves curated slugs in the curated order", () => {
    const resolved = resolveFeaturedReplications(
      ["geometry-frog-stingrayz", "snek-stingrayz"],
      replications,
      effectNames,
      0,
    );

    expect(resolved.map((entry) => entry.replication.slug)).toEqual([
      "geometry-frog-stingrayz",
      "snek-stingrayz",
    ]);
    expect(resolved[0].effectName).toBe("Geometry");
    expect(resolved[0].introduction).toBe("A replication of ");
  });

  it("skips a slug that no longer resolves instead of rendering a broken tile", () => {
    const resolved = resolveFeaturedReplications(
      ["geometry-frog-stingrayz", "retired-slug", "snek-stingrayz"],
      replications,
      effectNames,
      0,
    );

    expect(resolved.map((entry) => entry.replication.slug)).toEqual([
      "geometry-frog-stingrayz",
      "snek-stingrayz",
    ]);
  });

  it("skips an item whose media has no URL", () => {
    expect(
      resolveFeaturedReplications(["no-media-stingrayz"], replications, effectNames, 0),
    ).toEqual([]);
  });

  it("skips an item with no owning effect instead of crashing on it", () => {
    // The panel's caption is "A replication of <effect>" wrapped around a link
    // to that effect, so there is nothing to render — and humanising the missing
    // slug threw before it got that far.
    const unattached = replication({ slug: "page-hero", effect_slug: undefined });

    expect(() =>
      resolveFeaturedReplications(["page-hero"], [unattached], effectNames, 0),
    ).not.toThrow();
    expect(resolveFeaturedReplications(["page-hero"], [unattached], effectNames, 0)).toEqual([]);
  });

  it("falls back to a humanised effect slug when the effect is not in the read", () => {
    const [resolved] = resolveFeaturedReplications(
      ["orphan"],
      [replication({ slug: "orphan", effect_slug: "external-hallucination" })],
      new Map(),
      0,
    );

    expect(resolved.effectName).toBe("external hallucination");
    expect(resolved.introduction).toBe("A replication of an ");
  });

  it("rotates the resolved list by seed", () => {
    const resolved = resolveFeaturedReplications(
      ["geometry-frog-stingrayz", "snek-stingrayz"],
      replications,
      effectNames,
      1,
    );

    expect(resolved.map((entry) => entry.replication.slug)).toEqual([
      "snek-stingrayz",
      "geometry-frog-stingrayz",
    ]);
  });

  it("returns nothing when the whole curated list has gone stale", () => {
    expect(resolveFeaturedReplications(["a", "b"], [], effectNames, 4)).toEqual([]);
  });
});
