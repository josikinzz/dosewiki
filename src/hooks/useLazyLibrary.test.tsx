import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildLibraryMock, useIndexLayoutsMock } = vi.hoisted(() => ({
  buildLibraryMock: vi.fn(),
  useIndexLayoutsMock: vi.fn(),
}));

vi.mock("../data/builders/libraryBuilder", () => ({
  buildLibrary: buildLibraryMock,
}));

vi.mock("./useIndexLayouts", () => ({
  useIndexLayouts: useIndexLayoutsMock,
}));

import { useLazyLibrary } from "./useLazyLibrary";

function mockLibraryResponse(articles: unknown[]) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, articles }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useLazyLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

  it("loads the editor article projection so internal review notes survive editor reloads", async () => {
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
    const fetchMock = mockLibraryResponse(articles);

    renderHook(() => useLazyLibrary(true));

    // The editor projection is drained behind the editor-session-guarded Next
    // route: the browser has no admin intent token for the guarded query.
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/editor-library");

    await waitFor(() => {
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

  it("reports loading until the drained library arrives", async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLazyLibrary(true));

    expect(buildLibraryMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      library: null,
      isLoading: true,
      isReady: false,
      isEmpty: false,
    });

    resolveFetch?.({
      ok: true,
      json: async () => ({
        ok: true,
        articles: Array.from({ length: 32 }, (_, index) => ({
          id: index + 1,
          slug: `article-${index + 1}`,
        })),
      }),
    });

    await waitFor(() => {
      expect(buildLibraryMock).toHaveBeenCalled();
    });
  });

  it("makes no request at all while disabled", () => {
    const fetchMock = mockLibraryResponse([]);

    renderHook(() => useLazyLibrary(false));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
