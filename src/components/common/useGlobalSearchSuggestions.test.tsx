import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  resetSearchSuggestionsCacheForTests,
  useGlobalSearchSuggestions,
} from "./useGlobalSearchSuggestions";
import { loadSearchManifestIndex, resetSearchManifestForTests } from "@/hooks/useSearchManifest";

const MANIFEST = {
  version: "test",
  shape: 1,
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

/** Longer than the hook's 400ms refine delay. */
const PAST_REFINE_DELAY_MS = 700;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let suggestionsResponder: () => Promise<Response>;
let suggestionRequests: string[];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        return jsonResponse(MANIFEST);
      }
      if (url.includes("/api/search-suggestions")) {
        suggestionRequests.push(url);
        return suggestionsResponder();
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    const { result } = renderSuggestions("mdma");

    await waitFor(() => expect(ids(result.current.suggestions)).toEqual(["substance:mdma"]));

    await waitFor(
      () => expect(ids(result.current.suggestions)).toContain("effect:euphoria"),
      { timeout: 2000 },
    );
    expect(suggestionRequests).toHaveLength(1);
  });

  it("keeps local results on screen when the suggestion request is rate limited", async () => {
    suggestionsResponder = async () => jsonResponse({ error: "Too many requests." }, 429);
    await loadSearchManifestIndex();

    const { result } = renderSuggestions("mdma");

    await waitFor(() => expect(ids(result.current.suggestions)).toEqual(["substance:mdma"]));

    await sleep(PAST_REFINE_DELAY_MS);
    await waitFor(() => expect(suggestionRequests).toHaveLength(1));

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

  it("returns nothing when search is not active", () => {
    const { result } = renderHook(() =>
      useGlobalSearchSuggestions({ isActiveSearch: false, query: "mdma" }),
    );

    expect(result.current.suggestions).toEqual([]);
    expect(suggestionRequests).toEqual([]);
  });
});
