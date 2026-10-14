import { describe, expect, it } from "vitest";
import type { DatasetChangelogResult } from "@/utils/data/changelog";
import {
  buildDataSavePayload,
  getChangedArticles,
  mergeArticleWithOriginal,
} from "./devModePageUtils";

describe("devModePageUtils", () => {
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
});
