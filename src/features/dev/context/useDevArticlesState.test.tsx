import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ArticleRecord } from "./devModeTypes";
import { useDevArticlesState } from "./useDevArticlesState";

function articles(title: string, note: string): ArticleRecord[] {
  return [{ title, summary: note }] as unknown as ArticleRecord[];
}

describe("useDevArticlesState", () => {
  it("exposes the live source and the conflict once the working set stops taking updates", () => {
    const { result, rerender } = renderHook(
      ({ source }: { source: ArticleRecord[] }) => useDevArticlesState(source),
      { initialProps: { source: articles("LSD", "As loaded.") } },
    );

    // Clean working set: nothing is being held back, so the two agree.
    expect(result.current.articlesRefreshConflict).toBeNull();
    expect(result.current.sourceArticles[0].title).toBe("LSD");

    act(() => {
      result.current.updateArticleAt(0, {
        ...result.current.articles[0],
        title: "LSD (local)",
      });
    });

    rerender({ source: articles("LSD", "Someone else's summary.") });

    // The working set is now rendering a copy the database has moved past —
    // which is exactly what makes an inline write's `expected` baseline stale.
    // Both halves have to be readable: the fact that it is stale, and what the
    // store now holds.
    expect(result.current.articles[0].title).toBe("LSD (local)");
    expect(result.current.articlesRefreshConflict).not.toBeNull();
    expect(
      (result.current.sourceArticles[0] as { summary?: string }).summary,
    ).toBe("Someone else's summary.");

    act(() => {
      result.current.markChangesSaved();
    });

    expect(result.current.articlesRefreshConflict).toBeNull();
  });
});
