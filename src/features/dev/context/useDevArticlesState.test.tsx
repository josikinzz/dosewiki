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
        result.current.hydrateArticles(new Map([["lsd", { article: whole("lsd", "A whole article."), baseHash: "stored-base-hash" }]]));
      });

      expect(result.current.articles[0].summary).toBe("A whole article.");
      // Draft and baseline moved together, so nothing looks changed and the
      // save diff still ships nothing.
      expect(result.current.getOriginalArticles()[0].summary).toBe("A whole article.");
      expect(result.current.articles[0]).toBe(result.current.getOriginalArticles()[0]);
      expect(result.current.articlesRefreshConflict).toBeNull();
      expect(result.current.getArticleBaseHashes()).toEqual({ lsd: "stored-base-hash" });
    });

    it("retains a recovered baseline until a confirmed revision replaces it", () => {
      const source = slim();
      const { result } = renderHook(() => useDevArticlesState(source));
      act(() => result.current.hydrateArticles(new Map([["lsd", { article: whole("lsd", "Stored"), baseHash: "current-stored-hash" }]])));
      act(() => {
        result.current.updateArticleAt(0, whole("lsd", "Recovered edit"));
        result.current.restoreArticleBaseHashes({ lsd: "original-recovery-hash" });
      });
      act(() => result.current.hydrateArticles(new Map([["lsd", { article: whole("lsd", "Later stored"), baseHash: "later-hash" }]])));
      expect(result.current.getArticleBaseHashes().lsd).toBe("original-recovery-hash");
      expect(result.current.articles[0].summary).toBe("Recovered edit");
      act(() => result.current.markChangesSaved([{ slug: "lsd", baseHash: "confirmed-revision-hash" }]));
      expect(result.current.getArticleBaseHashes().lsd).toBe("confirmed-revision-hash");
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
        result.current.hydrateArticles(new Map([["lsd", { article: whole("lsd", "A whole article."), baseHash: "stored-base-hash" }]]));
      });

      // The edit and the source it was based on both outrank a late fetch.
      expect(result.current.articles[0].title).toBe("LSD (local)");
      expect(result.current.getOriginalArticles()[0].summary).toBe("");
    });
  });
});
