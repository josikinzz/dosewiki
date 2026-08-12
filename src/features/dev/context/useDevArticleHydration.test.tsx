import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDevArticleHydration } from "./useDevArticleHydration";
import type { SubstanceArticle } from "@/schema";

const articleFixture = (slug: string) => ({ slug, title: slug }) as unknown as SubstanceArticle;

function fullScopeFetch(slugs: string[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      scope: "full",
      articles: slugs.map(articleFixture),
      cursor: null,
      isDone: true,
    }),
  })) as unknown as typeof fetch;
}

describe("useDevArticleHydration full-corpus drain", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fullScopeFetch(["alpha", "beta"]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the gate when the drain lands after the count is stable", async () => {
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: 2, hydrateArticles: vi.fn() }),
    );

    act(() => result.current.requestFullCorpus());
    await waitFor(() => expect(result.current.isFullCorpusHydrated).toBe(true));
  });

  it("re-issues a wanted drain after the working set resets under it", async () => {
    // The regression: the review surface requests the drain while the working
    // set is still empty; the set then fills (0 -> N), the reset effect clears
    // the request flag, and the completed drain used to strand the gate shut.
    const { result, rerender } = renderHook(
      ({ articleCount }: { articleCount: number }) =>
        useDevArticleHydration({ articleCount, hydrateArticles: vi.fn() }),
      { initialProps: { articleCount: 0 } },
    );

    act(() => result.current.requestFullCorpus());
    rerender({ articleCount: 2 });

    await waitFor(() => expect(result.current.isFullCorpusHydrated).toBe(true));
  });

  it("surfaces a failed drain and recovers on retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch,
    );
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: 2, hydrateArticles: vi.fn() }),
    );

    act(() => result.current.requestFullCorpus());
    await waitFor(() => expect(result.current.fullCorpusFailed).toBe(true));

    vi.stubGlobal("fetch", fullScopeFetch(["alpha", "beta"]));
    act(() => result.current.requestFullCorpus());
    await waitFor(() => expect(result.current.isFullCorpusHydrated).toBe(true));
  });
});
