import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  applySuccessfulUpdates,
  createArticlePersistence,
  refreshLocalJsonExport,
} from "./persistence-artifacts.mjs";

const tmpRoots = [];

async function makeTmpPath() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-batch-export-"));
  tmpRoots.push(root);
  return path.join(root, "SubstanceIndex.json");
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("batch persistence artifacts", () => {
  it("rejects implicit local export mutation from per-result Postgres persistence", () => {
    expect(() =>
      createArticlePersistence({
        postgresClient: { mutation: async () => ({ created: 0, updated: 1 }) },
        adminKey: "secret",
        applyUpdate: (article) => article,
        updateLocalJson: true,
      }),
    ).toThrow(/separate local export refresh/i);
  });

  it("rejects implicit local export mutation from bulk Postgres persistence", async () => {
    await expect(
      applySuccessfulUpdates({
        results: { successfulUpdates: [{ title: "LSD", summary: "updated" }] },
        allArticles: [{ title: "LSD" }],
        postgresClient: { mutation: async () => ({ created: 0, updated: 1 }) },
        adminKey: "secret",
        applyUpdate: (article, update) => Object.assign(article, update),
        updateLocalJson: true,
      }),
    ).rejects.toThrow(/separate local export refresh/i);
  });

  it("refreshes local JSON export only through an explicit export phase", async () => {
    const articlesFile = await makeTmpPath();

    expect(() =>
      refreshLocalJsonExport({
        articles: [{ title: "LSD" }],
        articlesFile,
      }),
    ).toThrow(/confirmLocalExportRefresh/);

    refreshLocalJsonExport({
      articles: [{ title: "LSD" }],
      articlesFile,
      confirmLocalExportRefresh: true,
    });

    await expect(readFile(articlesFile, "utf8")).resolves.toContain('"title": "LSD"');
  });

  it("normalizes base articles, strips Postgres metadata, and fails on skipped saves", async () => {
    const savedArticles = [];
    const persist = createArticlePersistence({
      postgresClient: {
        mutation: async (_name, args) => {
          savedArticles.push(...args.articles);
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

    expect(savedArticles[0]._id).toBeUndefined();
    expect(savedArticles[0]._creationTime).toBeUndefined();
    expect(savedArticles[0].summary).toBe("Generated summary.");
    expect(savedArticles[0].dosage).toEqual({ plateau_dosing: null, routes: [] });
  });

  it("bulk updates use target Postgres articles instead of stale source articles", async () => {
    const savedArticles = [];
    const queryCalls = [];
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
          queryCalls.push(args);
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
    expect(queryCalls.map(({ paginationOpts }) => paginationOpts)).toEqual([
      { cursor: null, numItems: 32 },
      { cursor: "target-page-2", numItems: 32 },
    ]);
    expect(savedArticles[0].summary).toBe("Current target summary.");
    expect(savedArticles[0].pharmacology.pharmacodynamics).toBe("Current pharmacology.");
    expect(savedArticles[0].history_culture.sections).toHaveLength(1);
  });
});
