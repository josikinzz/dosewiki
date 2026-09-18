import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDevArticleHydration } from "./useDevArticleHydration";
import type { SubstanceArticle } from "@/schema";

const articleFixture = (slug: string) => ({ slug, title: slug }) as unknown as SubstanceArticle;

function slugFetch(known: string[]) {
  return vi.fn(async (input: string) => {
    const slug = new URL(input, "https://dose.wiki").searchParams.get("slug") ?? "";
    const found = known.includes(slug);
    return {
      ok: found,
      json: async () => (found ? { article: articleFixture(slug) } : {}),
    };
  }) as unknown as typeof fetch;
}

describe("useDevArticleHydration requestArticle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates a slug once and reports it as hydrated", async () => {
    const fetchMock = slugFetch(["alpha"]);
    vi.stubGlobal("fetch", fetchMock);
    const hydrateArticles = vi.fn();
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: 2, hydrateArticles }),
    );

    act(() => result.current.requestArticle("alpha"));
    act(() => result.current.requestArticle("alpha"));
    await waitFor(() => expect(result.current.isArticleHydrated("alpha")).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hydrateArticles).toHaveBeenCalledTimes(1);
  });

  it("unlatches a miss so the next request for that slug retries", async () => {
    const fetchMock = slugFetch([]);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: 2, hydrateArticles: vi.fn() }),
    );

    act(() => result.current.requestArticle("alpha"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    vi.stubGlobal("fetch", slugFetch(["alpha"]));
    act(() => result.current.requestArticle("alpha"));
    await waitFor(() => expect(result.current.isArticleHydrated("alpha")).toBe(true));
  });

  it("records a miss in failedSlugs and clears it once a later request lands", async () => {
    vi.stubGlobal("fetch", slugFetch([]));
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: 2, hydrateArticles: vi.fn() }),
    );
    expect(result.current.failedSlugs.size).toBe(0);

    act(() => result.current.requestArticle("alpha"));
    await waitFor(() => expect(result.current.failedSlugs.has("alpha")).toBe(true));

    vi.stubGlobal("fetch", slugFetch(["alpha"]));
    act(() => result.current.requestArticle("alpha"));
    // Re-issuing drops the failure before the response, so the surface stops
    // offering a retry the moment one is in flight.
    expect(result.current.failedSlugs.has("alpha")).toBe(false);
    await waitFor(() => expect(result.current.isArticleHydrated("alpha")).toBe(true));
    expect(result.current.failedSlugs.has("alpha")).toBe(false);
  });

  it("records a network error in failedSlugs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: 2, hydrateArticles: vi.fn() }),
    );

    act(() => result.current.requestArticle("alpha"));
    await waitFor(() => expect(result.current.failedSlugs.has("alpha")).toBe(true));
  });

  it("forgets failed slugs when the working set is replaced", async () => {
    vi.stubGlobal("fetch", slugFetch([]));
    const { result, rerender } = renderHook(
      ({ articleCount }) => useDevArticleHydration({ articleCount, hydrateArticles: vi.fn() }),
      { initialProps: { articleCount: 2 } },
    );

    act(() => result.current.requestArticle("alpha"));
    await waitFor(() => expect(result.current.failedSlugs.has("alpha")).toBe(true));

    rerender({ articleCount: 3 });
    await waitFor(() => expect(result.current.failedSlugs.size).toBe(0));
  });

  it("forgets every hydrated slug when the working set is replaced", async () => {
    vi.stubGlobal("fetch", slugFetch(["alpha"]));
    const { result, rerender } = renderHook(
      ({ articleCount }) => useDevArticleHydration({ articleCount, hydrateArticles: vi.fn() }),
      { initialProps: { articleCount: 2 } },
    );

    act(() => result.current.requestArticle("alpha"));
    await waitFor(() => expect(result.current.isArticleHydrated("alpha")).toBe(true));

    rerender({ articleCount: 3 });
    await waitFor(() => expect(result.current.isArticleHydrated("alpha")).toBe(false));
  });
});

describe("useDevArticleHydration hydrateArticlesNow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("commits each requested slug through the shared hydrate path and dedupes repeats", async () => {
    const hydrateArticles = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const slug = new URL(String(input), "https://dose.wiki").searchParams.get("slug");
        return {
          ok: true,
          json: async () => ({ ok: true, scope: "article", article: articleFixture(slug ?? "") }),
        };
      }),
    );
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: 2, hydrateArticles }),
    );

    let settled: { ok: boolean; articles: SubstanceArticle[] } | undefined;
    await act(async () => {
      settled = await result.current.hydrateArticlesNow(["alpha", "beta", "alpha", " "]);
    });

    expect(settled?.ok).toBe(true);
    expect(settled?.articles.map((article) => article.title)).toEqual(
      expect.arrayContaining(["alpha", "beta"]),
    );
    expect(settled?.articles).toHaveLength(2);
    const committedSlugs = hydrateArticles.mock.calls.flatMap(([bySlug]) => [
      ...(bySlug as Map<string, SubstanceArticle>).keys(),
    ]);
    expect(committedSlugs.sort()).toEqual(["alpha", "beta"]);
  });

  it("bounds in-flight requests and reports failures without dropping landed rows", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const hydrateArticles = vi.fn();
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h", "bad"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const slug = new URL(String(input), "https://dose.wiki").searchParams.get("slug");
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Executor form: this repo's lib target predates Promise.withResolvers.
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        if (slug === "bad") {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, scope: "article", article: articleFixture(slug ?? "") }),
        };
      }),
    );
    const { result } = renderHook(() =>
      useDevArticleHydration({ articleCount: slugs.length, hydrateArticles }),
    );

    let settled: { ok: boolean; articles: SubstanceArticle[] } | undefined;
    await act(async () => {
      settled = await result.current.hydrateArticlesNow(slugs);
    });

    expect(settled?.ok).toBe(false);
    expect(settled?.articles).toHaveLength(8);
    expect(maxInFlight).toBeLessThanOrEqual(6);
    const committedSlugs = hydrateArticles.mock.calls.flatMap(([bySlug]) => [
      ...(bySlug as Map<string, SubstanceArticle>).keys(),
    ]);
    expect(committedSlugs).not.toContain("bad");
  });
});
