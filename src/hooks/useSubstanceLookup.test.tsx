import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePaginatedQueryMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    substanceIndex: {
      getLookupPage: "substanceIndex.getLookupPage",
    },
  },
}));

import { useSubstanceLookup } from "./useSubstanceLookup";

describe("useSubstanceLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drains subsequent pages and publishes accumulated rows only when complete", () => {
    const loadMore = vi.fn();
    let response = {
      results: [{ slug: "a", name: "A" }],
      status: "CanLoadMore",
      loadMore,
    };
    usePaginatedQueryMock.mockImplementation(() => response);

    const { result, rerender } = renderHook(() => useSubstanceLookup());

    expect(usePaginatedQueryMock).toHaveBeenCalledWith(
      "substanceIndex.getLookupPage",
      {},
      { initialNumItems: 32 },
    );
    expect(loadMore).toHaveBeenCalledWith(32);
    expect(result.current).toMatchObject({ lookup: undefined, isLoading: true });

    response = {
      results: [
        { slug: "a", name: "A" },
        { slug: "b", name: "B" },
      ],
      status: "Exhausted",
      loadMore,
    };
    act(() => rerender());

    expect(result.current.lookup).toEqual([
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ]);
    expect(result.current.isLoading).toBe(false);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("keeps active editor clients off the legacy whole-table lookup", () => {
    const editorClients = [
      "src/app/dev/_components/NextDevRouteClient.tsx",
      "src/app/review/_components/ReviewRouteClient.tsx",
      "src/features/dev/tools/molecule-editor/MoleculeEditorTab.tsx",
    ];
    for (const file of editorClients) {
      const source = readFileSync(`${process.cwd()}/${file}`, "utf8");
      expect(source).not.toContain("api.substanceIndex.getLookup");
    }

    // The `/dev` shell dropped its lookup drain entirely: the editor projection
    // it already loads carries the same slug/name/priority. Clients that still
    // need a standalone lookup must go through the draining hook.
    for (const file of editorClients.slice(1)) {
      const source = readFileSync(`${process.cwd()}/${file}`, "utf8");
      expect(source).toContain("useSubstanceLookup");
    }

    const devShell = readFileSync(
      `${process.cwd()}/src/app/dev/_components/NextDevRouteClient.tsx`,
      "utf8",
    );
    expect(devShell).not.toContain("useSubstanceLookup");
  });

  it("skips the query and reports no loading work when disabled", () => {
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    const { result } = renderHook(() => useSubstanceLookup(false));

    expect(usePaginatedQueryMock).toHaveBeenCalledWith(
      "substanceIndex.getLookupPage",
      "skip",
      { initialNumItems: 32 },
    );
    expect(result.current.lookup).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
