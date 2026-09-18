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

  it("edits one article without copying or disturbing the rest of the corpus", () => {
    const source = [
      { title: "LSD", summary: "As loaded." },
      { title: "DMT", summary: "As loaded." },
    ] as unknown as ArticleRecord[];

    const { result } = renderHook(() => useDevArticlesState(source));

    act(() => {
      result.current.updateArticleAt(0, {
        ...result.current.articles[0],
        title: "LSD (local)",
      });
    });

    // The untouched article is still the same object the source handed over,
    // and the baseline never saw the edit.
    expect(result.current.articles[1]).toBe(source[1]);
    expect((result.current.sourceArticles[0] as { title: string }).title).toBe("LSD");
    expect((source[0] as unknown as { title: string }).title).toBe("LSD");

    // A single original article is copied on the way out, so a caller may treat
    // it as its own.
    const original = result.current.getOriginalArticle(0);
    expect(original).not.toBe(source[0]);
    expect((original as unknown as { title: string }).title).toBe("LSD");

    act(() => {
      result.current.resetArticleAt(0);
    });

    expect((result.current.articles[0] as { title: string }).title).toBe("LSD");
  });

  describe("hydrateArticles", () => {
    const slim = (): ArticleRecord[] =>
      [
        { slug: "lsd", title: "LSD", summary: "" },
        { slug: "mdma", title: "MDMA", summary: "" },
      ] as unknown as ArticleRecord[];

    const whole = (slug: string, summary: string) =>
      ({ slug, title: slug.toUpperCase(), summary }) as unknown as ArticleRecord;

    it("fills a row in without making the working set dirty", () => {
      const { result } = renderHook(() => useDevArticlesState(slim()));

      act(() => {
        result.current.hydrateArticles(new Map([["lsd", whole("lsd", "A whole article.")]]));
      });

      expect(result.current.articles[0].summary).toBe("A whole article.");
      // Draft and baseline moved together, so nothing looks changed and the
      // save diff still ships nothing.
      expect(result.current.getOriginalArticles()[0].summary).toBe("A whole article.");
      expect(result.current.articles[0]).toBe(result.current.getOriginalArticles()[0]);
      expect(result.current.articlesRefreshConflict).toBeNull();
    });

    it("leaves untouched rows alone", () => {
      const source = slim();
      const { result } = renderHook(() => useDevArticlesState(source));

      act(() => {
        result.current.hydrateArticles(new Map([["lsd", whole("lsd", "A whole article.")]]));
      });

      expect(result.current.articles[1]).toBe(source[1]);
    });

    it("does not overwrite a draft the user has already edited", () => {
      const { result } = renderHook(() => useDevArticlesState(slim()));

      act(() => {
        result.current.updateArticleAt(0, {
          ...result.current.articles[0],
          title: "LSD (local)",
        });
      });

      act(() => {
        result.current.hydrateArticles(new Map([["lsd", whole("lsd", "A whole article.")]]));
      });

      // The edit and the source it was based on both outrank a late fetch.
      expect(result.current.articles[0].title).toBe("LSD (local)");
      expect(result.current.getOriginalArticles()[0].summary).toBe("");
    });

    it("ignores an empty batch", () => {
      const { result } = renderHook(() => useDevArticlesState(slim()));
      const before = result.current.articles;

      act(() => {
        result.current.hydrateArticles(new Map());
      });

      expect(result.current.articles).toBe(before);
    });
  });
});
