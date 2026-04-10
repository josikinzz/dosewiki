import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import {
  findExistingArticleForSubstance,
  findExistingArticleIndex,
  upsertGeneratedArticle,
} from "./substanceEditorDraftUtils";
import type { SubstanceInfo } from "./types";

function createArticle(overrides: Record<string, unknown> = {}): SubstanceArticle {
  return {
    ...createEmptyArticle(),
    editorial_review: {
      status: "needed",
    },
    ...overrides,
  } as SubstanceArticle;
}

describe("substanceEditorDraftUtils", () => {
  it("finds existing articles by selected substance title before common name", () => {
    const articles = [
      createArticle({ id: 7, title: "LSD", identification: { common_name: "Acid" } }),
    ];
    const substances: SubstanceInfo[] = [
      {
        slug: "lsd",
        name: "LSD",
        sources: [],
        reviewStatus: "needed",
      },
    ];

    expect(findExistingArticleForSubstance(articles, substances, "lsd")?.id).toBe(7);
  });

  it("matches existing article index by id before falling back to text fields", () => {
    const articles = [
      createArticle({ id: 10, title: "Ketamine" }),
      createArticle({ id: 12, title: "LSD" }),
    ];

    const draft = createArticle({ id: 12, title: "Something Else" });

    expect(findExistingArticleIndex(articles, draft)).toBe(1);
  });

  it("falls back to title and common name matching when no id matches", () => {
    const articles = [
      createArticle({ id: 2, title: "Ketamine" }),
      createArticle({ id: 3, title: "Lysergic acid diethylamide", identification: { common_name: "LSD" } }),
    ];

    expect(
      findExistingArticleIndex(articles, createArticle({ title: "Ketamine" })),
    ).toBe(0);
    expect(
      findExistingArticleIndex(articles, createArticle({ identification: { common_name: "LSD" } })),
    ).toBe(1);
  });

  it("updates matching articles while preserving the existing id", () => {
    const articles = [
      createArticle({ id: 4, title: "LSD", identification: { common_name: "Acid" } }),
    ];

    const result = upsertGeneratedArticle(
      articles,
      createArticle({ id: 99, title: "LSD", identification: { common_name: "Acid" } }),
    );

    expect(result.action).toBe("updated");
    expect(result.assignedId).toBe(4);
    expect(result.nextArticles).toHaveLength(1);
    expect(result.nextArticles[0]?.id).toBe(4);
  });

  it("creates a new article with the next available id when no match exists", () => {
    const articles = [
      createArticle({ id: 4, title: "LSD" }),
      createArticle({ id: 7, title: "Ketamine" }),
    ];

    const result = upsertGeneratedArticle(
      articles,
      createArticle({ title: "Mescaline", identification: { common_name: "Mescaline" } }),
    );

    expect(result.action).toBe("created");
    expect(result.assignedId).toBe(8);
    expect(result.nextArticles).toHaveLength(3);
    expect(result.nextArticles[2]?.id).toBe(8);
  });
});
