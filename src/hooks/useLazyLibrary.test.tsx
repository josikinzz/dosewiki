import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildLibraryMock, useIndexLayoutsMock, usePaginatedQueryMock } = vi.hoisted(() => ({
  buildLibraryMock: vi.fn(),
  useIndexLayoutsMock: vi.fn(),
  usePaginatedQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    substanceIndex: {
      getEditorPage: "substanceIndex.getEditorPage",
    },
  },
}));

vi.mock("../data/builders/libraryBuilder", () => ({
  buildLibrary: buildLibraryMock,
}));

vi.mock("./useIndexLayouts", () => ({
  useIndexLayouts: useIndexLayoutsMock,
}));

import { useLazyLibrary } from "./useLazyLibrary";

describe("useLazyLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useIndexLayoutsMock.mockReturnValue({
      configs: {
        chemical: { categories: [] },
        mechanism: { categories: [] },
        psychoactive: { categories: [] },
      },
      isLoading: false,
    });
    buildLibraryMock.mockReturnValue({ articles: [] });
  });

  it("loads the editor article projection so internal review notes survive editor reloads", () => {
    const articles = [
      {
        id: 282,
        title: "Dextromethorphan",
        slug: "dextromethorphan",
        priority: "normal",
        index_categories: [],
        editorial_review: {
          status: "needed",
          notes: "Needs final manual pass.",
        },
      },
    ];
    usePaginatedQueryMock.mockReturnValue({
      results: articles,
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    renderHook(() => useLazyLibrary(true));

    expect(usePaginatedQueryMock).toHaveBeenCalledWith(
      "substanceIndex.getEditorPage",
      {},
      { initialNumItems: 100 },
    );
    expect(buildLibraryMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          editorial_review: expect.objectContaining({
            notes: "Needs final manual pass.",
          }),
        }),
      ]),
      expect.anything(),
    );
  });
});
