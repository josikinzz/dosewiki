import { describe, expect, it } from "vitest";

import { COVERAGE_GLYPHS } from "./coverageGlyphs";
import {
  COVERAGE_SECTION_IDS,
  buildCoverageRow,
  buildCoverageRows,
  buildCoverageTotals,
  getBibliographyState,
  getCoverageColumns,
  type CoverageArticleInput,
} from "./coverageModel";
import {
  COVERAGE_CITATION_DISPLAY,
  COVERAGE_CONTENT_DISPLAY,
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
      dosage: { routes: [{ route: "oral" }] },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.content[indexOf("dosage-duration")]).toBe("filled");
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
      dosage: { routes: [{ route: "oral", reference_ids: ["r1"] }] },
    } as Partial<CoverageArticleInput>);
    const row = buildCoverageRow(article, columns);
    expect(row.citations[indexOf("dosage-duration")]).toBe("cited");
    expect(row.bareCount).toBe(0);
  });

  it("separates a section a pass left bare from one no pass has reached", () => {
    const withPass = buildCoverageRow(
      makeArticle({
        references: [{ id: "r1", title: "A source" }],
        dosage: { routes: [{ route: "oral" }] },
      } as Partial<CoverageArticleInput>),
      columns,
    );
    const withoutPass = buildCoverageRow(
      makeArticle({
        dosage: { routes: [{ route: "oral" }] },
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
});

describe("status display vocabulary", () => {
  it("gives every status a tone class and either a glyph or a mark", () => {
    const displays = [
      ...Object.values(COVERAGE_CONTENT_DISPLAY),
      ...Object.values(COVERAGE_CITATION_DISPLAY),
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
    ]
      .map((display) => display.glyph)
      .filter((glyph): glyph is NonNullable<typeof glyph> => Boolean(glyph));

    expect(referenced.length).toBeGreaterThan(0);
    for (const glyph of referenced) {
      expect(COVERAGE_GLYPHS[glyph]?.body).toContain("<path");
    }
  });
});
