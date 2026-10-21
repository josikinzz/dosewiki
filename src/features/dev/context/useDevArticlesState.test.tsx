// @vitest-environment jsdom
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
  });
});
