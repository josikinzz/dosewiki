import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema";
import { applyReviewArticleOverlay } from "./reviewArticleOverlay";

describe("applyReviewArticleOverlay", () => {
  it("layers a persisted editorial review over a stale article", () => {
    const article = createEmptyArticle();
    const editorialReview = { status: "completed" as const, notes: "Reviewed." };

    const overlaid = applyReviewArticleOverlay(article, { editorialReview });

    expect(overlaid).not.toBe(article);
    expect(overlaid.editorial_review).toEqual(editorialReview);
  });

  it("returns the article untouched without a pending editorial review", () => {
    const article = createEmptyArticle();

    expect(applyReviewArticleOverlay(article, {})).toBe(article);
  });
});
