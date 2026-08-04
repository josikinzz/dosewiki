import { describe, expect, it } from "vitest";

import {
  COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD,
  extractPharmacologyYaml,
  mergeRouteDataIntoDosageDuration,
  parseArgs,
  parseGeneratedPharmacology,
  selectArticlesForProcessing,
} from "../scripts/batch/pharmacology/lib.mjs";

describe("batch pharmacology helpers", () => {
  it("parses CLI args with bounds and flags preserved", () => {
    const options = parseArgs(
      [
        "--concurrency=999",
        "--dry-run",
        "--verbose",
        "--slugs=lsd, mdma ,,2c-b",
        "--limit=20000",
        "--skip-backup",
        "--all",
        "--include-complete",
      ],
      { maxConcurrency: 3 },
    );

    expect(options).toEqual({
      concurrency: 50,
      dryRun: true,
      verbose: true,
      substance: null,
      slugs: ["lsd", "mdma", "2c-b"],
      limit: 10000,
      skipBackup: true,
      all: true,
      includeComplete: true,
      sourceUrl: null,
      targetUrl: null,
      write: false,
      expectedDeployment: null,
      confirmWrite: null,
      help: false,
    });
  });

  it("selects only quote-backed incomplete articles and reports summary counts", () => {
    const articles = [
      {
        title: "LSD",
        slug: "lsd",
        priority: "high",
        pharmacology: { pharmacodynamics: "filled" },
      },
      {
        title: "MDMA",
        slug: "mdma",
        priority: "normal",
        pharmacology: {
          pharmacodynamics: "filled",
          summary: "filled",
          binding_sites: [{ target: "SERT" }],
          pharmacokinetics: "filled",
          metabolites: ["MDA"],
          route_bioavailability: { oral: "high" },
        },
      },
      {
        title: "Caffeine",
        slug: "caffeine",
        priority: "low",
        pharmacology: {},
      },
      {
        title: "2C-B",
        slug: "2c-b",
        priority: "high",
        pharmacology: {},
      },
    ];

    const { articles: selected, summary } = selectArticlesForProcessing(
      articles,
      { all: false, substance: null, slugs: ["lsd", "mdma", "missing"], includeComplete: false, limit: null },
      new Set(["lsd", "mdma"]),
    );

    expect(selected.map((article) => article.slug)).toEqual(["lsd"]);
    expect(summary).toEqual({
      candidateCount: 3,
      quoteBackedCount: 2,
      incompleteCount: 2,
      preLimitCount: 1,
      requestedCount: 2,
      notFound: ["missing"],
    });
    expect(COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD).toBe(5);
  });

  it("extracts and repairs pharmacology YAML from model responses", () => {
    const response = `
<think>reasoning that should not leak</think>

\`\`\`yaml
pharmacology:
  pharmacodynamics: "Serotonergic partial agonist
  summary: concise summary
\`\`\`
`;

    expect(extractPharmacologyYaml(response)).toContain("pharmacology:");

    expect(parseGeneratedPharmacology(response)).toMatchObject({
      pharmacodynamics: "Serotonergic partial agonist",
      summary: "concise summary",
    });
  });

  it("merges route data using alias-aware matching", () => {
    const article = {
      dosage: {
        routes: [
          { route: "Insufflated", bioavailability: "", bioavailability_notes: "" },
          { route: "Oral", bioavailability: "", bioavailability_notes: "" },
        ],
      },
      duration: {
        routes: [
          { route: "Intravenous", half_life: "", half_life_notes: "" },
          { route: "Sublingual", half_life: "", half_life_notes: "" },
        ],
      },
    };

    mergeRouteDataIntoDosageDuration(article, {
      route_bioavailability: { intranasal: "65-80%" },
      route_bioavailability_notes: { oral: "first-pass metabolism" },
      route_half_life: { iv: "2-3 hours" },
      route_half_life_notes: { sublingual: "faster onset" },
    });

    expect(article).toMatchObject({
      dosage: {
        routes: [
          { route: "Insufflated", bioavailability: "65-80%" },
          { route: "Oral", bioavailability_notes: "first-pass metabolism" },
        ],
      },
      duration: {
        routes: [
          { route: "Intravenous", half_life: "2-3 hours" },
          { route: "Sublingual", half_life_notes: "faster onset" },
        ],
      },
    });
  });
});
