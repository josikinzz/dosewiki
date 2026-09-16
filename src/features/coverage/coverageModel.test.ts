import { describe, expect, it } from "vitest";

import { COVERAGE_GLYPHS } from "./coverageGlyphs";
import {
  COVERAGE_SECTION_IDS,
  buildCoverageRow,
  buildCoverageRows,
  buildCoverageTotals,
  buildReviewCountdown,
  getBibliographyState,
  getCoverageColumns,
  roaHollowCount,
  type CoverageArticleInput,
} from "./coverageModel";
import {
  COVERAGE_CITATION_DISPLAY,
  COVERAGE_CONTENT_DISPLAY,
  COVERAGE_REVIEW_DISPLAY,
  COVERAGE_STUB_DISPLAY,
  COVERAGE_TONE_CLASS,
} from "./coverageStatusDisplay";

const columns = getCoverageColumns();
const indexOf = (id: (typeof COVERAGE_SECTION_IDS)[number]) =>
  columns.findIndex((column) => column.id === id);

function makeArticle(
  overrides: Partial<CoverageArticleInput> = {},
): CoverageArticleInput {
  return {
    id: null,
    title: "Test Substance",
    slug: "test-substance",
    priority: "normal",
    index_categories: [],
    identification: {},
    classification: {},
    summary: "",
    dosage: { routes: [] },
    duration: { routes: [] },
    subjective_effects: {},
    comparisons: [],
    pharmacology: {},
    interactions: {},
    reagent_testing: {},
    tolerance: {
      full_tolerance: "",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: [],
    },
    harm_potential: {},
    history_culture: null,
    legality: {},
    editorial_review: {},
    references: [],
    source_citations: [],
    citations: [],
    ...overrides,
  } as CoverageArticleInput;
}

/**
 * A dosage route a reader would actually see a table for.
 *
 * The distinction this fixture draws is the point of the dosage column: a bare
 * `{ route: "oral" }`, or the fully scaffolded all-null shape generators emit,
 * renders an empty table and must not count as published data.
 */
function doseRoute(
  route: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    route,
    dose_ranges: {
      light: { min: 10, max: 20, unit: "mg" },
      moderate: { min: 20, max: 40, unit: "mg" },
    },
    ...overrides,
  };
}

/** The all-null skeleton a generator writes when a source merely names an ROA. */
function scaffoldDoseRoute(route: string): Record<string, unknown> {
  return {
    route,
    bioavailability: "",
    bioavailability_notes: "",
    notes: "",
    dose_ranges: {
      threshold: { min: null, max: null, unit: "mg" },
      light: { min: null, max: null, unit: "mg" },
      moderate: { min: null, max: null, unit: "mg" },
      strong: { min: null, max: null, unit: "mg" },
      heavy: { min: null, max: null, unit: "mg" },
    },
  };
}

function durationRoute(
  route: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    route,
    stages: {
      onset: { min: 20, max: 40, unit: "minutes" },
      total_duration: { min: 4, max: 6, unit: "hours" },
    },
    ...overrides,
  };
}

describe("coverage columns", () => {
  it("resolves every column from the section manifest", () => {
    expect(columns).toHaveLength(COVERAGE_SECTION_IDS.length);
    for (const column of columns) {
      expect(column.label.length).toBeGreaterThan(0);
      expect(column.icon).toMatch(/:/);
      expect(column.fields.length).toBeGreaterThan(0);
    }
  });

  it("omits reagent testing and the bibliography", () => {
    const ids = columns.map((column) => column.id) as string[];
    expect(ids).not.toContain("reagent-testing");
    expect(ids).not.toContain("sources");
  });
});

describe("bibliography state", () => {
  it("treats structured references as a completed pass", () => {
    const article = makeArticle({
      references: [{ id: "r1", title: "A source" }],
    } as Partial<CoverageArticleInput>);
    expect(getBibliographyState(article)).toBe("structured");
  });

  it("does not count a legacy bibliography as a pass", () => {
    const article = makeArticle({
      citations: [{ name: "Wikipedia", url: "https://example.test" }],
    } as Partial<CoverageArticleInput>);
    expect(getBibliographyState(article)).toBe("legacy");
  });

  it("reports no sources when both shapes are absent", () => {
    expect(getBibliographyState(makeArticle())).toBe("none");
  });
});

describe("content status", () => {
  it("marks a section empty when the manifest predicate rejects it", () => {
    const row = buildCoverageRow(makeArticle(), columns);
    expect(row.content[indexOf("dosage-duration")]).toBe("empty");
    expect(row.emptyCount).toBe(columns.length);
  });

  it("marks a section filled once it has content", () => {
    const article = makeArticle({
      dosage: { routes: [doseRoute("oral")] },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.content[indexOf("dosage-duration")]).toBe("filled");
  });

  it("does not count a route object with no dose values as dosage content", () => {
    // The manifest predicate used to be `routes.length > 0`, which scored the
    // generator's all-null scaffolding as published data and reported 272 of
    // 274 public articles as having dosage.
    const bare = buildCoverageRow(
      makeArticle({
        dosage: { routes: [{ route: "oral" }] },
      } as Partial<CoverageArticleInput>),
      columns,
    );
    const scaffolded = buildCoverageRow(
      makeArticle({
        dosage: { routes: [scaffoldDoseRoute("oral")] },
        duration: { routes: [] },
      } as Partial<CoverageArticleInput>),
      columns,
    );

    expect(bare.content[indexOf("dosage-duration")]).toBe("empty");
    expect(scaffolded.content[indexOf("dosage-duration")]).toBe("empty");
  });

  it("counts prose-only routes, which carry content the tables do not", () => {
    const article = makeArticle({
      dosage: {
        routes: [
          {
            route: "oral",
            notes: "Extract potency is unstandardized; no dose ladder applies.",
          },
        ],
      },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.content[indexOf("dosage-duration")]).toBe("filled");
  });
});

describe("route table counts", () => {
  it("counts blank route tables inside a section that still scores filled", () => {
    const article = makeArticle({
      dosage: {
        routes: [
          doseRoute("oral"),
          scaffoldDoseRoute("insufflated"),
          scaffoldDoseRoute("rectal"),
        ],
      },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);

    expect(row.content[indexOf("dosage-duration")]).toBe("filled");
    expect(row.roa).toEqual({ total: 3, blank: 2, partial: 0 });
    expect(roaHollowCount(row.roa)).toBe(2);
  });

  it("groups dosage and duration routes under their canonical name", () => {
    const article = makeArticle({
      dosage: { routes: [scaffoldDoseRoute("snorted")] },
      duration: { routes: [durationRoute("intranasal")] },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);

    // "snorted" and "intranasal" are one tab on the article page. The duration
    // side fills it, so the route is not blank — but its dosage half is an
    // all-null scaffold the section silently drops, which is `partial`.
    expect(row.roa).toEqual({ total: 1, blank: 0, partial: 1 });
  });

  it("does not call a duration-only route partial", () => {
    const article = makeArticle({
      duration: { routes: [durationRoute("oral")] },
    } as Partial<CoverageArticleInput>);

    // A route the article never claims a dosage entry for is a content gap of a
    // different kind, not scaffolding left behind by a generator.
    expect(buildCoverageRow(article, columns).roa).toEqual({
      total: 1,
      blank: 0,
      partial: 0,
    });
  });

  it("reports no routes when the article has none", () => {
    expect(buildCoverageRow(makeArticle(), columns).roa).toEqual({
      total: 0,
      blank: 0,
      partial: 0,
    });
  });
});

describe("stub verdict", () => {
  it("defers to the article stub policy rather than the empty-section count", () => {
    const row = buildCoverageRow(makeArticle(), columns);
    expect(row.stub.isStub).toBe(true);
    expect(row.stub.reasons).toEqual(["missing-sections", "no-dosage"]);
  });

  it("flags an otherwise written article that publishes no dosage data", () => {
    const article = makeArticle({
      dosage: { routes: [scaffoldDoseRoute("oral")] },
      subjective_effects: { notes: { overview: "Sustained euphoria." } },
      pharmacology: { pharmacodynamics: "Partial agonist at 5-HT2A." },
      tolerance: {
        full_tolerance: "Two weeks",
        half_tolerance: "One week",
        baseline_tolerance: "Three weeks",
        cross_tolerance: ["lsd"],
      },
      harm_potential: { summary: "Cardiovascular strain at high doses." },
      history_culture: { content: "First synthesized in 1970." },
      legality: { international: ["Unscheduled under the 1971 Convention."] },
      // Raw Postgres documents are looser than the article type — the scaffold
      // route carries nulls where the type wants numbers, which is the shape
      // this fixture exists to describe.
    } as unknown as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);

    expect(row.stub.reasons).toEqual(["no-dosage"]);
    expect(row.stub.isStub).toBe(true);
  });
});

describe("citation status", () => {
  it("is not-applicable when the section has no content to cite", () => {
    const article = makeArticle({
      references: [{ id: "r1", title: "A source" }],
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.citations[indexOf("dosage-duration")]).toBe("not-applicable");
  });

  it("detects inline cite tokens inside a section's own fields", () => {
    const article = makeArticle({
      references: [{ id: "r1", title: "A source" }],
      pharmacology: { pharmacodynamics: "Binds 5-HT2A [cite:r1]." },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.citations[indexOf("pharmacology")]).toBe("cited");
  });

  it("detects structured reference ids, which dosage evidence uses instead of tokens", () => {
    const article = makeArticle({
      references: [{ id: "r1", title: "A source" }],
      dosage: { routes: [doseRoute("oral", { reference_ids: ["r1"] })] },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.citations[indexOf("dosage-duration")]).toBe("cited");
    expect(row.bareCount).toBe(0);
  });

  it("separates a section a pass left bare from one no pass has reached", () => {
    const withPass = buildCoverageRow(
      makeArticle({
        references: [{ id: "r1", title: "A source" }],
        dosage: { routes: [doseRoute("oral")] },
      } as Partial<CoverageArticleInput>),
      columns,
    );
    const withoutPass = buildCoverageRow(
      makeArticle({
        dosage: { routes: [doseRoute("oral")] },
      } as Partial<CoverageArticleInput>),
      columns,
    );

    expect(withPass.citations[indexOf("dosage-duration")]).toBe("bare");
    expect(withPass.bareCount).toBe(1);
    expect(withoutPass.citations[indexOf("dosage-duration")]).toBe(
      "unattempted",
    );
    expect(withoutPass.bareCount).toBe(0);
  });

  it("does not credit a section for the article-level bibliography", () => {
    // `references` lives on the article, not in any section's fields. A scan
    // that walked it would report every section of every cited article cited.
    const article = makeArticle({
      references: [{ id: "r1", title: "A source", url: "https://example.test" }],
      legality: { international: ["Unscheduled under the 1971 Convention."] },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.citations[indexOf("legality")]).toBe("bare");
  });
});

describe("rows and totals", () => {
  it("drops articles with no slug and sorts the rest by name", () => {
    const rows = buildCoverageRows(
      [
        makeArticle({ title: "Zeta", slug: "zeta" }),
        makeArticle({ title: "Alpha", slug: "alpha" }),
        makeArticle({ title: "No Slug", slug: undefined }),
      ],
      columns,
    );
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("records index visibility so the default scope can exclude unlisted articles", () => {
    const rows = buildCoverageRows(
      [
        makeArticle({ slug: "listed", title: "Listed" }),
        makeArticle({ slug: "quiet", title: "Quiet", priority: "low" }),
        makeArticle({
          slug: "concealed",
          title: "Concealed",
          index_categories: ["hidden"],
        }),
        // Hidden wins over low priority, matching substanceVisibility().
        makeArticle({
          slug: "both",
          title: "Both",
          priority: "low",
          index_categories: ["Hidden"],
        }),
      ],
      columns,
    );

    const byName = Object.fromEntries(
      rows.map((row) => [row.name, row.visibility]),
    );
    expect(byName).toEqual({
      Listed: "public",
      Quiet: "low_priority",
      Concealed: "hidden",
      Both: "hidden",
    });
    expect(rows.filter((row) => row.visibility === "public")).toHaveLength(1);
  });

  it("totals content and citation state across the corpus", () => {
    const rows = buildCoverageRows(
      [
        makeArticle({
          slug: "cited",
          title: "Cited",
          references: [{ id: "r1", title: "A source" }],
          pharmacology: { pharmacodynamics: "Acts on X [cite:r1]." },
        } as Partial<CoverageArticleInput>),
        makeArticle({ slug: "bare", title: "Bare" }),
      ],
      columns,
    );
    const totals = buildCoverageTotals(rows, columns);

    expect(totals.articles).toBe(2);
    expect(totals.articlesWithPass).toBe(1);
    expect(totals.sections).toBe(2 * columns.length);
    expect(totals.filled).toBe(1);
    expect(totals.cited).toBe(1);
    expect(totals.perColumn[indexOf("pharmacology")]).toMatchObject({
      filled: 1,
      empty: 1,
      cited: 1,
    });
  });

  it("totals route tables and stub verdicts across the corpus", () => {
    const rows = buildCoverageRows(
      [
        makeArticle({
          slug: "hollow",
          title: "Hollow",
          dosage: {
            routes: [doseRoute("oral"), scaffoldDoseRoute("insufflated")],
          },
        } as Partial<CoverageArticleInput>),
        makeArticle({
          slug: "solid",
          title: "Solid",
          dosage: { routes: [doseRoute("oral")] },
        } as Partial<CoverageArticleInput>),
        makeArticle({ slug: "nothing", title: "Nothing" }),
      ],
      columns,
    );
    const totals = buildCoverageTotals(rows, columns);

    expect(totals.roa).toEqual({
      total: 3,
      blank: 1,
      partial: 0,
      articlesWithHollow: 1,
    });
    // All three are stubs on missing sections; only the empty one is also
    // dosage-less, which is why the count is articles and not reasons.
    expect(totals.stubs).toBe(3);
  });
});

describe("manual review", () => {
  it("reads the public-safe expert_reviewed flag, defaulting to unreviewed", () => {
    expect(
      buildCoverageRow(makeArticle({ expert_reviewed: true }), columns).reviewed,
    ).toBe(true);
    expect(
      buildCoverageRow(makeArticle({ expert_reviewed: false }), columns)
        .reviewed,
    ).toBe(false);
    // The raw editor-only object is never consulted, only the derived flag.
    expect(buildCoverageRow(makeArticle(), columns).reviewed).toBe(false);
  });

  it("totals reviewed articles across the corpus", () => {
    const rows = buildCoverageRows(
      [
        makeArticle({ slug: "done", title: "Done", expert_reviewed: true }),
        makeArticle({ slug: "todo", title: "Todo" }),
      ],
      columns,
    );
    expect(buildCoverageTotals(rows, columns).reviewed).toBe(1);
  });

  it("counts only the public corpus toward the deadline", () => {
    const rows = buildCoverageRows(
      [
        makeArticle({ slug: "done", title: "Done", expert_reviewed: true }),
        makeArticle({ slug: "todo", title: "Todo" }),
        // Off the launch corpus: unlisted articles never inflate the number.
        makeArticle({ slug: "quiet", title: "Quiet", priority: "low" }),
        makeArticle({
          slug: "concealed",
          title: "Concealed",
          index_categories: ["hidden"],
        }),
      ],
      columns,
    );

    const countdown = buildReviewCountdown(rows, new Date(2026, 6, 29, 12));
    expect(countdown.total).toBe(2);
    expect(countdown.reviewed).toBe(1);
    expect(countdown.remaining).toBe(1);
    // Noon July 29 → the 31st of August ends 33 full days later.
    expect(countdown.daysLeft).toBe(33);
    expect(countdown.perDay).toBeCloseTo(1 / 33);
  });

  it("reports a passed deadline instead of dividing by zero", () => {
    const rows = buildCoverageRows(
      [makeArticle({ slug: "todo", title: "Todo" })],
      columns,
    );
    const countdown = buildReviewCountdown(rows, new Date(2026, 8, 1, 12));
    expect(countdown.daysLeft).toBe(0);
    expect(countdown.perDay).toBeNull();
  });
});

describe("status display vocabulary", () => {
  it("gives every status a tone class and either a glyph or a mark", () => {
    const displays = [
      ...Object.values(COVERAGE_CONTENT_DISPLAY),
      ...Object.values(COVERAGE_CITATION_DISPLAY),
      ...Object.values(COVERAGE_STUB_DISPLAY),
      ...Object.values(COVERAGE_REVIEW_DISPLAY),
    ];
    for (const display of displays) {
      expect(COVERAGE_TONE_CLASS[display.tone]).toBeTruthy();
      if (display.tone !== "blank") {
        expect(Boolean(display.glyph || display.mark)).toBe(true);
      }
    }
  });

  it("only references glyphs the sprite actually defines", () => {
    const referenced = [
      ...Object.values(COVERAGE_CONTENT_DISPLAY),
      ...Object.values(COVERAGE_CITATION_DISPLAY),
      ...Object.values(COVERAGE_STUB_DISPLAY),
      ...Object.values(COVERAGE_REVIEW_DISPLAY),
    ]
      .map((display) => display.glyph)
      .filter((glyph): glyph is NonNullable<typeof glyph> => Boolean(glyph));

    expect(referenced.length).toBeGreaterThan(0);
    for (const glyph of referenced) {
      expect(COVERAGE_GLYPHS[glyph]?.body).toContain("<path");
    }
  });
});
