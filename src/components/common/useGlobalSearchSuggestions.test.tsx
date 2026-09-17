import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  resetSearchSuggestionsCacheForTests,
  useGlobalSearchSuggestions,
} from "./useGlobalSearchSuggestions";
import { loadSearchManifestIndex, resetSearchManifestForTests } from "@/hooks/useSearchManifest";
import type { SearchManifest } from "@/data/builders/searchManifest";
import { UiLocaleProvider, type UiLocale } from "@/i18n/client";

const MANIFEST: SearchManifest = {
  locale: "en",
  version: "test",
  shape: 2,
  entries: [
    { id: "substance:mdma", type: "substance", label: "MDMA", slug: "mdma", aliases: ["Molly"] },
    { id: "substance:mdai", type: "substance", label: "MDAI", slug: "mdai" },
  ],
};

/** What only the server can find: a match on class, mechanism or prose keywords. */
const KEYWORD_ONLY_RESULT = {
  id: "effect:euphoria",
  type: "effect",
  label: "Euphoria",
  slug: "euphoria",
};

const SERVER_RESULTS = [
  { id: "substance:mdma", type: "substance", label: "MDMA", slug: "mdma" },
  KEYWORD_ONLY_RESULT,
];

const LOCALIZED_MANIFEST: SearchManifest = {
  ...MANIFEST,
  locale: "zh-Hans",
  entries: [
    { ...MANIFEST.entries[0], label: "Localized MDMA", aliases: ["MDMA"] },
    MANIFEST.entries[1],
  ],
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let suggestionsResponder: (url: string) => Promise<Response>;
let suggestionRequests: string[];

const ids = (matches: ReadonlyArray<{ id: string }>) => matches.map((match) => match.id);

beforeEach(() => {
  resetSearchManifestForTests();
  resetSearchSuggestionsCacheForTests();
  suggestionRequests = [];
  suggestionsResponder = async () => jsonResponse({ results: SERVER_RESULTS });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/search-manifest")) {
        const locale = new URL(url, "https://dose.wiki").searchParams.get("locale");
        return jsonResponse(locale === "zh-Hans" ? LOCALIZED_MANIFEST : MANIFEST);
      }
      if (url.includes("/api/search-suggestions")) {
        suggestionRequests.push(url);
        return suggestionsResponder(url);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const renderSuggestions = (query: string) =>
  renderHook(() => useGlobalSearchSuggestions({ isActiveSearch: true, query }));

describe("useGlobalSearchSuggestions", () => {
  it("answers from the manifest before any suggestion request is made", async () => {
    await loadSearchManifestIndex();
    const { result } = renderSuggestions("md");

    await waitFor(() => {
      expect(ids(result.current.suggestions)).toEqual(["substance:mdai", "substance:mdma"]);
    });

    expect(suggestionRequests).toEqual([]);
    expect(result.current.isFetchingSuggestions).toBe(false);
  });

  it("replaces local results with the server's once they arrive", async () => {
    await loadSearchManifestIndex();
    const { result } = renderSuggestions("md");

    await waitFor(() => expect(ids(result.current.suggestions)).toEqual(["substance:mdai", "substance:mdma"]));

    await waitFor(
      () => expect(ids(result.current.suggestions)).toEqual(ids(SERVER_RESULTS)),
      { timeout: 2000 },
    );
    expect(suggestionRequests).toHaveLength(1);
  });

  it("keeps local results on screen when the suggestion request is rate limited", async () => {
    let resolveRefinement!: (response: Response) => void;
    suggestionsResponder = () => new Promise<Response>((resolve) => {
      resolveRefinement = resolve;
    });
    await loadSearchManifestIndex();

    const { result } = renderSuggestions("mdma");

    await waitFor(() => expect(ids(result.current.suggestions)).toEqual(["substance:mdma"]));

    await waitFor(() => expect(suggestionRequests).toHaveLength(1), { timeout: 2000 });
    await act(async () => {
      resolveRefinement(jsonResponse({ error: "Too many requests." }, 429));
    });

    // The old hook blanked the list on any failed request, so a 429 mid-typing
    // read to the user as "no matches found".
    expect(ids(result.current.suggestions)).toEqual(["substance:mdma"]);
    expect(result.current.isFetchingSuggestions).toBe(false);
  });

  it("still answers from the server when the manifest cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/search-manifest")) {
          return jsonResponse({ error: "nope" }, 500);
        }
        suggestionRequests.push(url);
        return jsonResponse({ results: SERVER_RESULTS });
      }),
    );

    const { result } = renderSuggestions("mdma");

    // The request is debounced even without local results, so allow for the
    // refine delay before the server answer lands.
    await waitFor(
      () => expect(ids(result.current.suggestions)).toEqual(ids(SERVER_RESULTS)),
      { timeout: 2000 },
    );
  });

  it("does not reuse cached English suggestions for the same query in another locale", async () => {
    const localizedServerResults = [
      { ...SERVER_RESULTS[0], label: "Localized server MDMA" },
    ];
    suggestionsResponder = async (url) => jsonResponse({
      results: new URL(url, "https://dose.wiki").searchParams.get("locale") === "zh-Hans"
        ? localizedServerResults
        : SERVER_RESULTS,
    });
    await Promise.all([loadSearchManifestIndex("en"), loadSearchManifestIndex("zh-Hans")]);
    let locale: UiLocale = "en";
    const { result, rerender } = renderHook(
      () => useGlobalSearchSuggestions({ isActiveSearch: true, query: "mdma" }),
      { wrapper: ({ children }) => <UiLocaleProvider locale={locale}>{children}</UiLocaleProvider> },
    );
    await waitFor(
      () => expect(ids(result.current.suggestions)).toEqual(ids(SERVER_RESULTS)),
      { timeout: 2000 },
    );

    locale = "zh-Hans";
    rerender();
    expect(result.current.suggestions.map((match) => match.label)).toEqual(["Localized MDMA"]);
    await waitFor(
      () => expect(result.current.suggestions.map((match) => match.label)).toEqual(["Localized server MDMA"]),
      { timeout: 2000 },
    );

    locale = "en";
    rerender();
    expect(ids(result.current.suggestions)).toEqual(ids(SERVER_RESULTS));
    expect(suggestionRequests).toHaveLength(2);
  });

  it("revalidates expired repeat queries without blanking cached results and deduplicates overlap", async () => {
    vi.useFakeTimers();
    const first = renderSuggestions("mdma");
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(ids(first.result.current.suggestions)).toEqual(ids(SERVER_RESULTS));
    first.unmount();

    await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    let resolveRefinement!: (response: Response) => void;
    suggestionsResponder = () => new Promise<Response>((resolve) => {
      resolveRefinement = resolve;
    });
    const repeated = renderSuggestions("mdma");
    const overlapping = renderSuggestions("mdma");
    expect(ids(repeated.result.current.suggestions)).toEqual(ids(SERVER_RESULTS));
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(suggestionRequests).toHaveLength(2);
    expect(ids(repeated.result.current.suggestions)).toEqual(ids(SERVER_RESULTS));

    await act(async () => {
      resolveRefinement(jsonResponse({ results: [KEYWORD_ONLY_RESULT] }));
    });
    expect(ids(repeated.result.current.suggestions)).toEqual([KEYWORD_ONLY_RESULT.id]);
    expect(ids(overlapping.result.current.suggestions)).toEqual([KEYWORD_ONLY_RESULT.id]);
    repeated.unmount();
    overlapping.unmount();
  });

  it("evicts the oldest query while retaining recent fresh responses", async () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ query }) => useGlobalSearchSuggestions({ isActiveSearch: true, query }),
      { initialProps: { query: "query-0" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(400));
    for (let index = 1; index <= 100; index += 1) {
      rerender({ query: `query-${index}` });
      await act(() => vi.advanceTimersByTimeAsync(400));
    }
    expect(suggestionRequests).toHaveLength(101);
    rerender({ query: "query-99" });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(suggestionRequests).toHaveLength(101);
    rerender({ query: "query-0" });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(suggestionRequests).toHaveLength(102);
    unmount();
  });

  it("returns nothing when search is not active", () => {
    const { result } = renderHook(() =>
      useGlobalSearchSuggestions({ isActiveSearch: false, query: "mdma" }),
    );

    expect(result.current.suggestions).toEqual([]);
    expect(suggestionRequests).toEqual([]);
  });
});
