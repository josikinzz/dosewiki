import { act, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "next-auth";
import { SessionContext, SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
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
const authenticatedSession: Session = {
  expires: "2099-01-01T00:00:00.000Z",
  user: { email: "editor@example.com", role: "editor" },
};

function AuthenticatedSession({ children }: { children: ReactNode }) {
  return <SessionProvider session={authenticatedSession}>{children}</SessionProvider>;
}

function renderLazyLibrary(enabled: boolean) {
  return renderHook(() => useLazyLibrary(enabled), { wrapper: AuthenticatedSession });
}


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
      error: null,
      retry: vi.fn(),
    });
    buildLibraryMock.mockImplementation((articles) => ({ articles }));
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

    const { result } = renderLazyLibrary(true);

    expect(result.current).toMatchObject({
      library: null,
      isLoading: true,
      isReady: false,
      isEmpty: false,
    });

    await act(async () => {
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
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });
  it("treats a successfully fetched empty corpus as a ready empty library", async () => {
    mockLibraryResponse([]);

    const { result } = renderLazyLibrary(true);

    await waitFor(() => {
      expect(result.current).toMatchObject({
        library: { articles: [] },
        error: null,
        isLoading: false,
        isReady: true,
        isEmpty: true,
      });
    });
    await expect(result.current.requestLibrary()).resolves.toBeUndefined();
  });

  it("settles each failed retry instead of leaving later requests pending", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { error: "Editor library unavailable." },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderLazyLibrary(true);
    await waitFor(() => expect(result.current.error).toBe("Editor library unavailable."));

    const firstRetry = result.current.requestLibrary();
    await expect(firstRetry).rejects.toThrow("Editor library unavailable.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const secondRetry = result.current.requestLibrary();
    await expect(secondRetry).rejects.toThrow("Editor library unavailable.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });


  it("does not reuse another editor's corpus after the session changes", async () => {
    let session = authenticatedSession;
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        articles: [{ id: 1, slug: "private-draft", title: "Private draft" }],
      }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveSecond = resolve;
      }));
    vi.stubGlobal("fetch", fetchMock);
    function Scope({ children }: { children: ReactNode }) {
      return (
        <SessionContext.Provider value={{
          data: session,
          status: "authenticated",
          update: async () => session,
        }}>
          {children}
        </SessionContext.Provider>
      );
    }
    const { result, rerender } = renderHook(() => useLazyLibrary(true), { wrapper: Scope });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    session = { ...authenticatedSession, user: { email: "other@example.com", role: "editor" } };
    rerender();
    expect(result.current.library).toBeNull();
    expect(result.current.isReady).toBe(false);

    await act(async () => {
      resolveSecond?.(Response.json({ articles: [] }));
    });
    await waitFor(() => expect(result.current).toMatchObject({ isReady: true, isEmpty: true }));
    expect(result.current.library?.articles).toEqual([]);
  });

  it("does not treat an incomplete successful response as an empty corpus", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    const { result } = renderLazyLibrary(true);
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.library).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.isEmpty).toBe(false);
  });

  it("makes no request at all while disabled", () => {
    const fetchMock = mockLibraryResponse([]);

    renderLazyLibrary(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
