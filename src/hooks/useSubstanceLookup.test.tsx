import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSubstanceLookup } from "./useSubstanceLookup";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** Two keyset pages: the first hands back a cursor, the second is the end. */
function stubLookupPages() {
  const requested: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      requested.push(`${url.pathname}${url.search}`);
      const cursor = url.searchParams.get("cursor");
      const page = cursor === "after-a"
        ? { page: [{ slug: "b", name: "B" }], continueCursor: "", isDone: true }
        : { page: [{ slug: "a", name: "A" }], continueCursor: "after-a", isDone: false };
      return Response.json(page);
    }),
  );
  return requested;
}

describe("useSubstanceLookup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("threads each continueCursor back and publishes the rows only once the drain is complete", async () => {
    const requested = stubLookupPages();

    const { result } = renderHook(() => useSubstanceLookup(), { wrapper: createWrapper() });

    expect(result.current).toMatchObject({ lookup: undefined, isLoading: true });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lookup).toEqual([
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ]);
    expect(requested).toEqual([
      "/api/editor/substances?page=lookup&numItems=200",
      "/api/editor/substances?page=lookup&numItems=200&cursor=after-a",
    ]);
  });

  it("skips the read and reports no loading work when disabled", () => {
    const requested = stubLookupPages();

    const { result } = renderHook(() => useSubstanceLookup(false), { wrapper: createWrapper() });

    expect(requested).toEqual([]);
    expect(result.current.lookup).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
