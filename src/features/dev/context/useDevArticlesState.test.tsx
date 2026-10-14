import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ArticleRecord } from "./devModeTypes";
import { useDevArticlesState } from "./useDevArticlesState";

describe("useDevArticlesState", () => {
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
  });
});
