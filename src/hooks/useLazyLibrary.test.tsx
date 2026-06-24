import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildLibraryMock, useIndexLayoutsMock, useQueryMock } = vi.hoisted(() => ({
  buildLibraryMock: vi.fn(),
  useIndexLayoutsMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    substanceIndex: {
      getEditorAll: "substanceIndex.getEditorAll",
      getLibraryInput: "substanceIndex.getLibraryInput",
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
    useQueryMock.mockReturnValue(articles);

    renderHook(() => useLazyLibrary(true));

    expect(useQueryMock).toHaveBeenCalledWith("substanceIndex.getEditorAll", {});
    expect(useQueryMock).not.toHaveBeenCalledWith("substanceIndex.getLibraryInput", {});
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
