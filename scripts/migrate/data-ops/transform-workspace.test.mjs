import { describe, expect, it, vi } from "vitest";

import {
  applyMigrationPlan,
  createArticleMigrationPlan,
} from "./transform-workspace.mjs";
import {
  backfillSlug,
  moveStandardCitationsToSources,
  populateDosageDuration,
  populateSourceCitations,
} from "./article-transforms.mjs";
import { validateSubstanceArticleShape } from "./transform-workspace.mjs";

function validateTitleAndCitations(article) {
  const issues = [];
  if (typeof article.title !== "string" || article.title.length === 0) {
    issues.push({ path: "title", message: "Title is required", code: "required" });
  }
  if (!Array.isArray(article.citations)) {
    issues.push({ path: "citations", message: "Citations must be an array", code: "invalid_type" });
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, article, issues: [] };
}

describe("article migration transform workspace", () => {
  it("returns changed, unchanged, skipped, warning, validation failure, and summary counts", () => {
    const articles = [
      { title: "Changed", citations: [] },
      { title: "Same", citations: [] },
      { title: "Skip", citations: [] },
      { title: "Warn", citations: [] },
      { title: "Invalid", citations: [] },
    ];

    const plan = createArticleMigrationPlan({
      articles,
      validateArticle: validateTitleAndCitations,
      transform: ({ article }) => {
        if (article.title === "Changed") {
          return { article: { ...article, summary: "new" } };
        }
        if (article.title === "Skip") {
          return { skipped: true, reason: "not targeted" };
        }
        if (article.title === "Warn") {
          return { article: { ...article, summary: "warned" }, warnings: ["check source"] };
        }
        if (article.title === "Invalid") {
          return { article: { ...article, citations: "not-an-array" } };
        }
        return { article };
      },
    });

    expect(plan.summary).toEqual({
      total: 5,
      changed: 2,
      unchanged: 1,
      skipped: 1,
      warnings: 1,
      validationFailures: 1,
      diffByField: { summary: 2 },
    });
    expect(plan.changedRecords.map((record) => record.title)).toEqual(["Changed", "Warn"]);
    expect(plan.unchangedRecords.map((record) => record.title)).toEqual(["Same"]);
    expect(plan.skippedRecords[0]).toMatchObject({ title: "Skip", reason: "not targeted" });
    expect(plan.validationFailures[0]).toMatchObject({
      title: "Invalid",
      issues: [{ path: "citations", message: "Citations must be an array", code: "invalid_type" }],
    });
  });

  it("does not apply invalid transformed articles to the persistence result", () => {
    const writeAdapter = vi.fn();
    const articles = [{ title: "Invalid", citations: [] }];
    const plan = createArticleMigrationPlan({
      articles,
      validateArticle: validateTitleAndCitations,
      transform: ({ article }) => ({ article: { ...article, citations: "bad" } }),
    });

    if (plan.validationFailures.length === 0) {
      writeAdapter(applyMigrationPlan(plan));
    }

    expect(writeAdapter).not.toHaveBeenCalled();
    expect(applyMigrationPlan(plan)).toEqual(articles);
  });

  it("keeps a stable structured diff for a multi-article golden dataset", () => {
    const articles = [
      { title: "Alpha", citations: [], slug: "alpha" },
      { title: "Beta Test", citations: [] },
    ];
    const plan = createArticleMigrationPlan({
      articles,
      transform: backfillSlug,
    });

    const golden = {
      summary: {
        total: 2,
        changed: 1,
        unchanged: 1,
        skipped: 0,
        warnings: 0,
        validationFailures: 0,
        diffByField: { slug: 1 },
      },
      changedDiffs: [
        {
          title: "Beta Test",
          fields: ["slug"],
          afterSlug: "beta-test",
        },
      ],
    };

    expect({
      summary: plan.summary,
      changedDiffs: plan.changedRecords.map((record) => ({
        title: record.title,
        fields: record.diff.changedFields.map((change) => change.field),
        afterSlug: record.after.slug,
      })),
    }).toEqual(golden);
  });
});

describe("article transform adapters", () => {
  it("validates references-era route ids against structured references", () => {
    expect(validateSubstanceArticleShape({
      id: null,
      title: "Valid",
      index_categories: [],
      identification: {},
      classification: {},
      summary: "",
      dosage: { routes: [{ route: "Oral", reference_ids: ["pmid-12345"] }] },
      duration: { routes: [{ route: "Oral", reference_ids: ["pmid-12345"] }] },
      subjective_effects: {},
      comparisons: [],
      pharmacology: {},
      interactions: {},
      reagent_testing: {},
      tolerance: {},
      harm_potential: {},
      legality: {},
      references: [
        {
          id: "pmid-12345",
          title: "Primary paper",
          sourceType: "primary_literature",
          quality: "high",
        },
      ],
      citations: [],
    }).ok).toBe(true);

    expect(validateSubstanceArticleShape({
      id: null,
      title: "Invalid",
      index_categories: [],
      identification: {},
      classification: {},
      summary: "",
      dosage: { routes: [{ route: "Oral", reference_ids: ["missing-ref"] }] },
      duration: { routes: [] },
      subjective_effects: {},
      comparisons: [],
      pharmacology: {},
      interactions: {},
      reagent_testing: {},
      tolerance: {},
      harm_potential: {},
      legality: {},
      references: [],
      citations: [],
    })).toMatchObject({
      ok: false,
      issues: [
        {
          path: "dosage.routes[0].reference_ids[0]",
          code: "custom",
        },
      ],
    });
  });

  it("moves standard citations to source citations and deduplicates existing source citations", () => {
    const article = {
      title: "Ketamine",
      citations: [
        { name: "Journal", url: "https://example.com/paper" },
        { name: "PsychonautWiki", url: "https://psychonautwiki.org/wiki/Ketamine" },
        { name: "Erowid", url: "https://erowid.org/chemicals/ketamine/" },
      ],
      source_citations: [
        { name: "Existing PW", url: "https://psychonautwiki.org/wiki/Ketamine/" },
      ],
    };

    const result = moveStandardCitationsToSources({ article });

    expect(result.metadata.movedCount).toBe(1);
    expect(result.article.citations).toEqual([
      { name: "Journal", url: "https://example.com/paper" },
    ]);
    expect(result.article.source_citations.map((citation) => citation.name)).toEqual([
      "Erowid",
      "Existing PW",
    ]);
  });

  it("populates source citations from an article-source adapter payload", () => {
    const sourceContent = `export const sources = [{"id":"erowid","displayName":"Erowid"},{"id":"drugusersbible","displayName":"Drug Users Bible"}];
export const sourceContent = {
"erowid": \`*Source: https://erowid.org/chemicals/test/test.shtml*
Body\`,
"drugusersbible": \`Body without URL\`,
};`;
    const article = {
      title: "Test",
      citations: [
        { name: "Erowid duplicate", url: "https://erowid.org/chemicals/test/test.shtml/" },
        { name: "Other", url: "https://example.com/other" },
      ],
    };

    const result = populateSourceCitations({
      article,
      sources: { articleSource: sourceContent },
    });

    expect(result.article.source_citations).toEqual([
      { name: "Erowid", url: "https://erowid.org/chemicals/test/test.shtml" },
      { name: "Drug Users Bible by Dominic Milton Trott", url: "" },
    ]);
    expect(result.article.citations).toEqual([
      { name: "Other", url: "https://example.com/other" },
    ]);
    expect(result.metadata).toMatchObject({
      sourceCitationsAdded: 2,
      citationsDeduplicated: 1,
      drugUsersBibleCount: 1,
    });
  });

  it("populates dosage and duration from a parsed source adapter payload", () => {
    const article = { title: "Test Substance", citations: [], dosage: { routes: [] }, duration: { routes: [] } };
    const parsedDosageDuration = {
      substances: {
        "test-substance": {
          dosage: [
            {
              source: "erowid",
              route: "oral",
              ranges: {
                common: { min: 10, max: 20, unit: "mg" },
                strong: { min: 20, max: 30, unit: "mg" },
              },
            },
          ],
          duration: [
            {
              source: "erowid",
              route: "oral",
              stages: {
                onset: { min: 20, max: 40, unit: "minutes" },
                total: { min: 4, max: 6, unit: "hours" },
              },
            },
          ],
        },
      },
    };

    const result = populateDosageDuration({
      article,
      sources: { parsedDosageDuration },
    });

    expect(result.metadata).toEqual({ dosageRoutes: 1, durationRoutes: 1 });
    expect(result.article.dosage.routes[0]).toMatchObject({
      route: "Oral",
      dose_ranges: {
        moderate: { min: 10, max: 20, unit: "mg" },
        strong: { min: 20, max: 30, unit: "mg" },
        heavy: { min: 30, max: null, unit: "mg" },
      },
    });
    expect(result.article.duration.routes[0]).toMatchObject({
      route: "Oral",
      stages: {
        onset: { min: 20, max: 40, unit: "minutes" },
        total_duration: { min: 4, max: 6, unit: "hours" },
      },
    });
  });

  it("backfills a slug without changing articles that already match", () => {
    expect(backfillSlug({ article: { title: "2C-B", citations: [] } }).article.slug).toBe("2c-b");
    expect(backfillSlug({ article: { title: "2C-B", slug: "2c-b", citations: [] } }).article).toEqual({
      title: "2C-B",
      slug: "2c-b",
      citations: [],
    });
  });
});
