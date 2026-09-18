import { describe, expect, it } from "vitest";

import {
  CITABLE_SECTIONS,
  SUBSECTION_TRACKER_SCHEMA,
  TRACKER_STATUSES,
  VIABILITY_FLOOR_CHARS,
  buildExportScope,
  buildSubsectionAudit,
  classifyCoverage,
  normalizeSectionList,
  publicSlugsFromLayout,
  sectionMetrics,
  seedSubsectionTracker,
  selectedSectionsFromTracker,
} from "./subsection-rollout-lib.mjs";

function longText(seed, length = 80) {
  return `${seed} ${"x".repeat(length)}`.trim();
}

function createArticle(slug, overrides = {}) {
  return {
    slug,
    title: slug.toUpperCase(),
    summary: "",
    pharmacology: {},
    tolerance: {},
    harm_potential: {},
    history_culture: {},
    legality: {},
    references: [],
    ...overrides,
  };
}

const layout = {
  version: 1,
  categories: [
    {
      key: "psychedelics",
      label: "Psychedelics",
      iconKey: "molecule",
      sections: [
        { key: "tryptamines", label: "Tryptamines", drugs: ["4-aco-dipt", "psilocin"] },
      ],
      drugs: ["2c-b"],
    },
    {
      key: "dissociatives",
      label: "Dissociatives",
      iconKey: "molecule",
      sections: [],
      drugs: ["deschloroketamine", "4-aco-dipt"],
    },
  ],
};

describe("publicSlugsFromLayout", () => {
  it("flattens category and section drugs in layout order without duplicates", () => {
    expect(publicSlugsFromLayout(layout)).toEqual([
      "4-aco-dipt",
      "psilocin",
      "2c-b",
      "deschloroketamine",
    ]);
  });

  it("returns an empty list for a missing layout", () => {
    expect(publicSlugsFromLayout(null)).toEqual([]);
  });
});

describe("sectionMetrics", () => {
  it("counts non-marker characters, inline markers, and hashes the raw value", () => {
    const plain = longText("Psilocin is a substituted tryptamine.");
    const cited = `${plain}[cite:ref-a]`;
    const metrics = sectionMetrics(cited);
    expect(metrics.markerCount).toBe(1);
    expect(metrics.chars).toBe(plain.replace(/\s+/g, " ").trim().length);
    expect(metrics.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const uncited = sectionMetrics(plain);
    expect(uncited.markerCount).toBe(0);
    expect(uncited.chars).toBe(metrics.chars);
    expect(uncited.contentHash).not.toBe(metrics.contentHash);
  });

  it("handles nested section objects and null values", () => {
    const metrics = sectionMetrics({
      pharmacodynamics: `Acts on 5-HT2 receptors[cite:ref-b]. ${"y".repeat(60)}`,
      metabolites: [],
    });
    expect(metrics.markerCount).toBe(1);
    expect(metrics.chars).toBeGreaterThan(VIABILITY_FLOOR_CHARS);
    expect(sectionMetrics(null)).toEqual({ chars: 0, markerCount: 0, contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("produces a hash insensitive to key ordering", () => {
    const left = sectionMetrics({ a: "one", b: "two" });
    const right = sectionMetrics({ b: "two", a: "one" });
    expect(left.contentHash).toBe(right.contentHash);
  });
});

describe("classifyCoverage", () => {
  it("classifies inline, legacy bibliography, and uncited sections", () => {
    expect(classifyCoverage({ markerCount: 2, referenceCount: 5 })).toBe("inline");
    expect(classifyCoverage({ markerCount: 0, referenceCount: 5 })).toBe("legacy_bibliography");
    expect(classifyCoverage({ markerCount: 0, referenceCount: 0 })).toBe("uncited");
  });
});

describe("buildSubsectionAudit", () => {
  const citedSummary = `${longText("2C-B is a psychedelic phenethylamine.")}[cite:pihkal]`;
  const articles = [
    createArticle("2c-b", {
      summary: citedSummary,
      pharmacology: { pharmacodynamics: longText("Partial agonist at 5-HT2 receptors.") },
      references: [{ id: "pihkal", title: "PiHKAL" }],
    }),
    createArticle("4-aco-dipt", {
      summary: longText("4-AcO-DiPT is a synthetic tryptamine."),
    }),
    createArticle("not-in-layout", { summary: longText("Not public.") }),
  ];

  const audit = buildSubsectionAudit({
    articles,
    layout,
    cohortSlugs: ["2c-b"],
    queueItems: [{ drugSlug: "2c-b", status: "complete" }],
    evidenceBySlug: {
      "2c-b": [
        { slug: "2c-b", section: "summary", status: "supported" },
        { slug: "2c-b", section: "summary", status: "needs_review" },
      ],
    },
    generatedAt: "2026-07-19T00:00:00.000Z",
  });

  it("covers all six canonical sections including tolerance", () => {
    expect(audit.sections).toEqual(CITABLE_SECTIONS);
    expect(audit.sections).toContain("tolerance");
    const twoCB = audit.articles.find((entry) => entry.slug === "2c-b");
    expect(Object.keys(twoCB.sections).sort()).toEqual([...CITABLE_SECTIONS].sort());
  });

  it("limits the audit to the public layout scope", () => {
    expect(audit.articles.map((entry) => entry.slug)).toEqual(["4-aco-dipt", "2c-b"]);
    expect(audit.totals.publicArticles).toBe(2);
  });

  it("records chars, marker counts, hashes, coverage form, and queue status per section", () => {
    const twoCB = audit.articles.find((entry) => entry.slug === "2c-b");
    expect(twoCB.queueStatus).toBe("complete");
    expect(twoCB.inCohort).toBe(true);
    expect(twoCB.sections.summary).toMatchObject({
      markerCount: 1,
      coverageForm: "inline",
      viable: true,
      evidence: { supported: 1, needs_review: 1 },
    });
    expect(twoCB.sections.summary.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(twoCB.sections.pharmacology).toMatchObject({
      markerCount: 0,
      coverageForm: "legacy_bibliography",
      viable: true,
    });
    expect(twoCB.sections.tolerance).toMatchObject({
      chars: 0,
      coverageForm: "legacy_bibliography",
      viable: false,
    });
  });

  it("counts viable uncited gaps per cohort slug", () => {
    // 2c-b: pharmacology (viable, legacy) is a gap; summary cited; four empty sections not viable.
    expect(audit.totals.cohortViableGaps).toBe(1);
    const aco = audit.articles.find((entry) => entry.slug === "4-aco-dipt");
    expect(aco.inCohort).toBe(false);
    expect(aco.sections.summary.coverageForm).toBe("uncited");
  });
});

describe("seedSubsectionTracker", () => {
  const cohortAudit = buildSubsectionAudit({
    articles: [
      createArticle("2c-b", {
        summary: `${longText("2C-B is a psychedelic phenethylamine.")}[cite:pihkal]`,
        pharmacology: { pharmacodynamics: longText("Partial agonist at 5-HT2 receptors.") },
        references: [{ id: "pihkal", title: "PiHKAL" }],
      }),
      createArticle("4-aco-dipt", {
        summary: longText("4-AcO-DiPT is a synthetic tryptamine."),
        tolerance: longText("Tolerance develops quickly."),
      }),
    ],
    layout,
    cohortSlugs: ["2c-b", "4-aco-dipt"],
    generatedAt: "2026-07-19T00:00:00.000Z",
  });

  it("creates one ready row per viable uncited cohort section and records skips", () => {
    const { tracker, report } = seedSubsectionTracker({
      audit: cohortAudit,
      seededAt: "2026-07-19T01:00:00.000Z",
    });

    expect(tracker.schemaVersion).toBe(SUBSECTION_TRACKER_SCHEMA);
    const keys = tracker.items.map((item) => `${item.slug}:${item.section}`);
    // Items follow public category-layout order, not cohort argument order.
    expect(keys).toEqual(["4-aco-dipt:summary", "4-aco-dipt:tolerance", "2c-b:pharmacology"]);
    for (const item of tracker.items) {
      expect(item.status).toBe("ready");
      expect(item.originalContentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(TRACKER_STATUSES).toContain(item.status);
    }

    const skipKeys = tracker.skipped.map((item) => `${item.slug}:${item.section}:${item.reason}`);
    expect(skipKeys).toContain("2c-b:summary:skipped_already_cited");
    expect(skipKeys).toContain("2c-b:tolerance:skipped_empty");
    expect(report.added).toBe(3);
  });
  it("can seed every public gap instead of only the tagged cohort", () => {
    const { tracker, report } = seedSubsectionTracker({
      audit: cohortAudit,
      seededAt: "2026-07-19T01:00:00.000Z",
      scope: "public",
    });

    const keys = tracker.items.map((item) => `${item.slug}:${item.section}`);
    expect(keys).toEqual([
      "4-aco-dipt:summary",
      "4-aco-dipt:tolerance",
      "2c-b:pharmacology",
    ]);
    expect(report.added).toBe(3);
  });

  it("preserves existing row statuses on reseed and flags live drift", () => {
    const { tracker: first } = seedSubsectionTracker({
      audit: cohortAudit,
      seededAt: "2026-07-19T01:00:00.000Z",
    });
    first.items.find((item) => item.slug === "2c-b" && item.section === "pharmacology").status = "applied";

    const driftedAudit = buildSubsectionAudit({
      articles: [
        createArticle("2c-b", {
          summary: `${longText("2C-B is a psychedelic phenethylamine.")}[cite:pihkal]`,
          pharmacology: { pharmacodynamics: longText("Different live pharmacology text.") },
          references: [{ id: "pihkal", title: "PiHKAL" }],
        }),
        createArticle("4-aco-dipt", {
          summary: longText("4-AcO-DiPT is a synthetic tryptamine."),
          tolerance: longText("Tolerance develops quickly."),
        }),
      ],
      layout,
      cohortSlugs: ["2c-b", "4-aco-dipt"],
      generatedAt: "2026-07-20T00:00:00.000Z",
    });

    const { tracker, report } = seedSubsectionTracker({
      audit: driftedAudit,
      existingTracker: first,
      seededAt: "2026-07-20T01:00:00.000Z",
    });

    const pharmacology = tracker.items.find((item) => item.slug === "2c-b" && item.section === "pharmacology");
    expect(pharmacology.status).toBe("applied");
    expect(pharmacology.drift).toMatchObject({ detectedAt: "2026-07-20T01:00:00.000Z" });
    expect(pharmacology.originalContentHash).not.toBe(driftedAudit.articles[0].sections.pharmacology.contentHash);
    expect(report.preserved).toBeGreaterThan(0);
    expect(report.drifted).toEqual(["2c-b:pharmacology"]);
  });

  it("reports tracker items that are no longer gaps without changing them", () => {
    const { tracker: first } = seedSubsectionTracker({
      audit: cohortAudit,
      seededAt: "2026-07-19T01:00:00.000Z",
    });

    const resolvedAudit = buildSubsectionAudit({
      articles: [
        createArticle("2c-b", {
          summary: `${longText("2C-B is a psychedelic phenethylamine.")}[cite:pihkal]`,
          pharmacology: { pharmacodynamics: `${longText("Partial agonist at 5-HT2 receptors.")}[cite:new-ref]` },
          references: [{ id: "pihkal", title: "PiHKAL" }],
        }),
        createArticle("4-aco-dipt", {
          summary: longText("4-AcO-DiPT is a synthetic tryptamine."),
          tolerance: longText("Tolerance develops quickly."),
        }),
      ],
      layout,
      cohortSlugs: ["2c-b", "4-aco-dipt"],
      generatedAt: "2026-07-20T00:00:00.000Z",
    });

    const { tracker, report } = seedSubsectionTracker({
      audit: resolvedAudit,
      existingTracker: first,
      seededAt: "2026-07-20T01:00:00.000Z",
    });

    const pharmacology = tracker.items.find((item) => item.slug === "2c-b" && item.section === "pharmacology");
    expect(pharmacology.status).toBe("ready");
    expect(report.noLongerGaps).toEqual(["2c-b:pharmacology"]);
  });
});

describe("normalizeSectionList", () => {
  it("accepts citable sections in order and rejects bad input", () => {
    expect(normalizeSectionList(["pharmacology", "tolerance"])).toEqual(["pharmacology", "tolerance"]);
    expect(() => normalizeSectionList([])).toThrow(/non-empty/);
    expect(() => normalizeSectionList(["nope"])).toThrow(/not in the citable article surface/);
    expect(() => normalizeSectionList(["summary", "summary"])).toThrow(/duplicate/);
  });
});

describe("buildExportScope", () => {
  const original = {
    summary: `Cited summary prose that is comfortably long. [cite:ref-1]`,
    pharmacology: longText("Uncited pharmacology prose."),
    tolerance: null,
    harm_potential: longText("Legacy bibliography section."),
    history_culture: longText("More legacy prose."),
    legality: longText("Legality notes."),
  };
  const stripped = {
    ...original,
    summary: "Cited summary prose that is comfortably long. ",
  };

  it("freezes hashes over the stripped task surface with explicit skip reasons", () => {
    const scope = buildExportScope({
      originalSections: original,
      strippedSections: stripped,
      selectedSections: ["pharmacology"],
      referenceCount: 2,
      source: "explicit",
      frozenAt: "2026-07-18T00:00:00.000Z",
    });
    expect(scope.selectedSections).toEqual(["pharmacology"]);
    expect(Object.keys(scope.sectionScope.sections)).toEqual([...CITABLE_SECTIONS]);

    const summary = scope.sectionScope.sections.summary;
    expect(summary.selected).toBe(false);
    expect(summary.skipReason).toBe("already_cited");
    expect(summary.markerCount).toBe(1);
    expect(summary.coverageForm).toBe("inline");
    // Hash covers the stripped export content so preflight can re-hash the task.
    expect(summary.contentHash).toBe(sectionMetrics("Cited summary prose that is comfortably long. ").contentHash);

    expect(scope.sectionScope.sections.tolerance.skipReason).toBe("empty");
    const harm = scope.sectionScope.sections.harm_potential;
    expect(harm.skipReason).toBe("not_selected");
    expect(harm.coverageForm).toBe("legacy_bibliography");

    const pharmacology = scope.sectionScope.sections.pharmacology;
    expect(pharmacology.selected).toBe(true);
    expect(pharmacology.skipReason).toBeNull();
  });

  it("rejects selecting a section that is empty in the task surface", () => {
    expect(() => buildExportScope({
      originalSections: { pharmacology: null },
      strippedSections: { pharmacology: null },
      selectedSections: ["pharmacology"],
      source: "explicit",
      frozenAt: "2026-07-18T00:00:00.000Z",
    })).toThrow(/empty in the exported task surface/);
  });
});

describe("selectedSectionsFromTracker", () => {
  it("derives ready sections in tracker order and fails when none are ready", () => {
    const tracker = {
      items: [
        { slug: "a", section: "pharmacology", status: "researching" },
        { slug: "a", section: "summary", status: "applied" },
        { slug: "a", section: "tolerance", status: "excluded" },
        { slug: "a", section: "harm_potential", status: "ready" },
        { slug: "b", section: "legality", status: "ready" },
      ],
    };
    // researching rows stay selected so an in-flight run can re-export its scope;
    // excluded rows never enter a new run.
    expect(TRACKER_STATUSES).toContain("excluded");
    expect(selectedSectionsFromTracker(tracker, "a")).toEqual(["pharmacology", "harm_potential"]);
    expect(() => selectedSectionsFromTracker(tracker, "missing")).toThrow(/No ready subsection rows/);
  });
});
