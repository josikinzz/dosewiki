import { describe, expect, it } from "vitest";

import { applySuccessfulUpdates, createArticlePersistence } from "./persistence-artifacts.mjs";

describe("batch persistence artifacts", () => {
  it("fails on skipped saves", async () => {
    const persist = createArticlePersistence({
      postgresClient: {
        mutation: async () => {
          return {
            created: 0,
            updated: 0,
            skipped: 1,
            errors: ["Substance LSD: Invalid structure"],
            outcomes: [
              {
                action: "skipped",
                title: "LSD",
                canonicalSlug: "lsd",
                affectedPaths: [],
                error: "Substance LSD: Invalid structure",
              },
            ],
          };
        },
      },
      adminKey: "secret",
      targetArticlesBySlug: new Map([
        [
          "lsd",
          {
            _id: "postgres-id",
            _creationTime: 123,
            title: "LSD",
            priority: "high",
            summary: "Current summary.",
          },
        ],
      ]),
      applyUpdate: (article, result) => {
        article.summary = result.summary;
        return article;
      },
    });

    await expect(
      persist({ slug: "lsd", title: "LSD", summary: "Generated summary." }),
    ).rejects.toThrow(/Postgres sync failed for lsd/);
  });

  it("bulk updates use target Postgres articles instead of stale source articles", async () => {
    const savedArticles = [];
    const result = await applySuccessfulUpdates({
      results: {
        successfulUpdates: [
          {
            slug: "alcohol",
            title: "Alcohol",
            history_culture: {
              content: "",
              sections: [{ title: "Discovery", content: "Fermentation is ancient." }],
            },
          },
        ],
      },
      allArticles: [
        {
          title: "Alcohol",
          slug: "alcohol",
          summary: "Stale source summary.",
          pharmacology: {},
          history_culture: null,
        },
      ],
      postgresClient: {
        query: async (_name, args) => {
          if (args.paginationOpts.cursor === null) {
            return {
              page: [{ title: "Ketamine", slug: "ketamine" }],
              isDone: false,
              continueCursor: "target-page-2",
            };
          }
          if (args.paginationOpts.cursor === "target-page-2") {
            return {
              page: [
                {
                  title: "Alcohol",
                  slug: "alcohol",
                  summary: "Current target summary.",
                  pharmacology: {
                    pharmacodynamics: "Current pharmacology.",
                    binding_sites: [],
                    pharmacokinetics: "",
                    metabolites: [],
                  },
                  history_culture: null,
                },
              ],
              isDone: true,
              continueCursor: null,
            };
          }
          throw new Error(`Unexpected pagination cursor: ${args.paginationOpts.cursor}`);
        },
        mutation: async (_name, args) => {
          savedArticles.push(...args.articles);
          return { created: 0, updated: 1, skipped: 0, errors: [], outcomes: [], affectedPaths: [] };
        },
      },
      adminKey: "secret",
      applyUpdate: (article, update) => {
        article.history_culture = update.history_culture;
        return article;
      },
    });

    expect(result.updated).toBe(1);
    expect(savedArticles[0].summary).toBe("Current target summary.");
    expect(savedArticles[0].pharmacology.pharmacodynamics).toBe("Current pharmacology.");
    expect(savedArticles[0].history_culture.sections).toHaveLength(1);
  });
});
