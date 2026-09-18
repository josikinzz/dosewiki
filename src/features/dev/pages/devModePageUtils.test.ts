import { describe, expect, it } from "vitest";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import {
  buildCombinedChangelogMarkdown,
  buildCommitMarkdown,
  buildDataSavePayload,
  extractChangeLogSummary,
  formatArticleLabel,
  getChangedArticles,
  mergeArticleWithOriginal,
  normalizeDataChangeLogEntry,
  resolvePrimaryTab,
} from "./devModePageUtils";

describe("devModePageUtils", () => {
  it("resolves primary tabs for dev mode navigation", () => {
    expect(resolvePrimaryTab("articles")).toBe("tools");
    expect(resolvePrimaryTab("contributors")).toBe("tools");
    expect(resolvePrimaryTab("change-log")).toBe("change-log");
  });


  it("formats labels and extracts changelog summaries", () => {
    expect(formatArticleLabel({ title: "LSD", id: 12 }, 0)).toBe("LSD · #12");
    expect(
      extractChangeLogSummary(
        {
          id: "12",
          identification: { common_name: "2C-B" },
        },
        0,
      ),
    ).toEqual({
      id: 12,
      title: "2C-B",
      slug: "2c-b",
    });
  });

  it("builds preview and commit markdown from change segments", () => {
    const changes = [
      { hasChanges: true, markdown: "# One\n\n+ a\n" },
      { hasChanges: false, markdown: "# Two\n\n+ b\n" },
      { hasChanges: true, markdown: "# Three\n\n- c\n" },
    ];

    expect(buildCombinedChangelogMarkdown(changes)).toBe("# One\n\n+ a\n\n---\n\n# Three\n\n- c");
    expect(buildCommitMarkdown(changes)).toBe("# One\n\n+ a\n\n---\n\n# Three\n\n- c\n");
  });

  it("detects changed articles and builds Postgres save payloads", () => {
    const articles = [{ id: 1, title: "LSD" }, { id: 2, title: "MDMA" }] as never[];
    const originalArticles = [{ id: 1, title: "LSD" }] as never[];
    const datasetChangelog: DatasetChangelogResult = {
      markdown: "# Changes\n\n+ MDMA",
      articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
      sections: [{ index: 1, heading: "MDMA", markdown: "# Changes\n\n+ MDMA" }],
    };

    expect(getChangedArticles(articles, originalArticles)).toEqual([{ id: 2, title: "MDMA" }]);

    expect(
      buildDataSavePayload({
        articles,
        originalArticles,
        datasetChangelog,
      }),
    ).toEqual({
      changedArticles: [{ id: 2, title: "MDMA" }],
      payload: {
        articles: [{ id: 2, title: "MDMA" }],
        changelog: {
          markdown: "# Changes\n\n+ MDMA",
          articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
        },
      },
    });
  });

  it("preserves original article ids when merging drafts", () => {
    expect(mergeArticleWithOriginal({ id: 9, title: "LSD" }, { title: "LSD updated" } as never)).toEqual({
      title: "LSD updated",
      id: 9,
    });
  });

  it("normalizes changelog entries from save results", () => {
    expect(
      normalizeDataChangeLogEntry({
        id: "data-1",
        createdAt: "2026-04-09T00:00:00.000Z",
        commit: { sha: "", url: "", message: "Saved" },
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        markdown: "# Saved",
        submittedBy: "JOSIE",
      }),
    ).toEqual({
      id: "data-1",
      createdAt: "2026-04-09T00:00:00.000Z",
      commit: { sha: "", url: "", message: "Saved" },
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
      markdown: "# Saved",
      submittedBy: "JOSIE",
    });
  });
});
