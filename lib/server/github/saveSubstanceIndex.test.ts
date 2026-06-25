import { describe, expect, it } from "vitest";

import { buildSubstanceIndexFileChangeSet } from "./saveSubstanceIndex.mjs";

const buildValidArticle = () => ({
  id: 1,
  title: "Test Substance",
  index_categories: [],
  identification: {},
  classification: {},
  summary: "",
  dosage: {},
  duration: {},
  subjective_effects: {},
  comparisons: [],
  pharmacology: {},
  interactions: {},
  reagent_testing: {},
  tolerance: {},
  harm_potential: {},
  legality: {},
  citations: [],
});

describe("substance index GitHub adapter", () => {
  it("builds the same file paths and default commit message for article saves", async () => {
    const { changeSet, entry } = await buildSubstanceIndexFileChangeSet({
      body: {
        articlesData: [buildValidArticle()],
        psychoactiveIndexManualData: { Ketamine: { priority: "high" } },
        aboutMarkdown: "About\r\nDoseWiki",
        aboutSubtitleMarkdown: "Readable drug information",
        aboutConfig: { founderProfileKeys: [" josie ", "JOSIE", " alex "] },
        generatorPrompt: "Write carefully",
        changedArticles: [{ id: "1", title: " Test Substance ", slug: " test-substance " }],
      },
      submittedBy: "EDITOR",
      existingChangeLogEntries: [],
      timestamp: new Date("2026-04-26T12:00:00.000Z"),
      entryId: "dev-fixed",
    });

    expect(changeSet.kind).toBe("backup");
    expect(changeSet.target).toEqual({
      owner: "josikinzz",
      repo: "dosewiki-admin",
      branch: "main",
    });
    expect(changeSet.message).toBe("Update substance index (EDITOR)");
    expect(changeSet.actor).toEqual({ key: "EDITOR" });
    expect(changeSet.files.map((file) => file.path)).toEqual([
      "src/data/SubstanceIndex.json",
      "src/data/changelog/devChangeLog.json",
      "src/data/indexes/psychoactiveIndexManual.json",
      "src/data/content/aboutContent.md",
      "src/data/content/aboutSubtitle.md",
      "src/data/content/aboutConfig.json",
      "src/data/article-sources/prompt.md",
    ]);
    expect(changeSet.files.find((file) => file.path.endsWith("aboutContent.md"))?.content).toBe("About\nDoseWiki\n");
    expect(changeSet.files.find((file) => file.path.endsWith("aboutConfig.json"))?.content).toBe(
      `${JSON.stringify({ founderProfileKeys: ["JOSIE", "ALEX"] }, null, 2)}\n`,
    );
    expect(entry).toMatchObject({
      id: "dev-fixed",
      createdAt: "2026-04-26T12:00:00.000Z",
      submittedBy: "EDITOR",
      articles: [{ id: 1, title: "Test Substance", slug: "test-substance" }],
    });
  });

  it("preserves changelog behavior for skip-article saves", async () => {
    const olderEntry = {
      id: "older",
      createdAt: "2026-04-25T12:00:00.000Z",
      commit: { sha: "abc", url: "https://example.test", message: "Older" },
      markdown: "Older entry",
      articles: [],
      submittedBy: "EDITOR",
    };

    const { changeSet } = await buildSubstanceIndexFileChangeSet({
      body: {
        skipArticles: true,
        commitMessage: "Update prompt copy",
        changelogMarkdown: "Changed prompt copy",
        generatorPrompt: "New prompt",
      },
      submittedBy: "EDITOR",
      existingChangeLogEntries: [olderEntry],
      timestamp: new Date("2026-04-26T12:00:00.000Z"),
      entryId: "newer",
    });

    expect(changeSet.files.map((file) => file.path)).toEqual([
      "src/data/changelog/devChangeLog.json",
      "src/data/article-sources/prompt.md",
    ]);
    const changelog = JSON.parse(
      changeSet.files.find((file) => file.path === "src/data/changelog/devChangeLog.json")?.content ?? "[]",
    );
    expect(changelog.map((entry: { id: string }) => entry.id)).toEqual(["newer", "older"]);
    expect(changelog[0]).toMatchObject({
      markdown: "Changed prompt copy",
      commit: { message: "Update prompt copy" },
    });
  });

  it("accepts formal citation references and route reference_ids on the backup save path", async () => {
    const formalCitationArticle = {
      ...buildValidArticle(),
      references: [
        {
          id: "pmid-12345",
          title: "Primary paper",
          type: "journal_article",
          sourceType: "primary_literature",
          quality: "high",
        },
      ],
      dosage: {
        routes: [
          {
            route: "Oral",
            reference_ids: ["pmid-12345"],
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "Oral",
            reference_ids: ["pmid-12345"],
          },
        ],
      },
    };

    const { changeSet } = await buildSubstanceIndexFileChangeSet({
      body: {
        articlesData: [formalCitationArticle],
      },
      submittedBy: "EDITOR",
      existingChangeLogEntries: [],
      timestamp: new Date("2026-05-01T12:00:00.000Z"),
      entryId: "dev-formal-citations",
    });

    const serializedArticles = JSON.parse(
      changeSet.files.find((file) => file.path === "src/data/SubstanceIndex.json")?.content ?? "[]",
    );

    expect(serializedArticles[0]).toMatchObject({
      references: [
        {
          id: "pmid-12345",
          title: "Primary paper",
          type: "journal_article",
          sourceType: "primary_literature",
          quality: "high",
        },
      ],
      dosage: {
        routes: [
          {
            route: "Oral",
            reference_ids: ["pmid-12345"],
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "Oral",
            reference_ids: ["pmid-12345"],
          },
        ],
      },
    });
  });

  it("rejects malformed formal citation payloads with a specific failing path", async () => {
    await expect(
      buildSubstanceIndexFileChangeSet({
        body: {
          articlesData: [
            {
              ...buildValidArticle(),
              references: [
                {
                  id: "bad-reference",
                  title: "Broken reference",
                  type: "webpage",
                  sourceType: "unknown",
                  quality: "fallback",
                  url: 42,
                },
              ],
            },
          ],
        },
        submittedBy: "EDITOR",
      }),
    ).rejects.toThrow(/articlesData payload is invalid: 0\.references\.0\.url/i);
  });

  it("rejects route reference_ids that are not present in structured references", async () => {
    await expect(
      buildSubstanceIndexFileChangeSet({
        body: {
          articlesData: [
            {
              ...buildValidArticle(),
              dosage: {
                routes: [
                  {
                    route: "Oral",
                    reference_ids: ["missing-reference"],
                  },
                ],
              },
            },
          ],
        },
        submittedBy: "EDITOR",
      }),
    ).rejects.toThrow(/articlesData payload is invalid: 0\.dosage\.routes\.0\.reference_ids\.0/i);
  });
});
