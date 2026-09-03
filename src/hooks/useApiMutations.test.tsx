import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSaveToConvexMutation } from "./useApiMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useApiMutations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces Convex save network failures with the shared transport helper", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useSaveToConvexMutation(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync({ articles: [{ slug: "lsd" }] })).rejects.toThrow(
      "Convex save request failed: offline",
    );
  });

  it("returns normalized Convex save metadata from a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          requestId: "req_123",
          savedItems: ["articles", 123, "about"],
          warnings: ["warning-1"],
          verification: [
            {
              target: "slug:lsd",
              found: true,
              previousSlug: null,
              requestedSlug: "lsd",
              storedSlug: "lsd",
              storedTitle: "LSD",
              titleMatches: true,
              slugMatches: true,
            },
            {
              target: 4,
            },
          ],
          revalidatedPaths: ["/lsd", 42],
          articleResult: {
            created: 1,
            updated: 2,
            errors: ["bad-slug", 17],
          },
          entry: {
            id: "entry_1",
            createdAt: "2026-04-22T00:00:00.000Z",
            commit: {
              sha: "abc123",
              url: "https://example.com/commit/abc123",
              message: "Save article",
            },
            articles: [
              { id: 1, title: "LSD", slug: "lsd" },
              { id: "oops", title: "skip", slug: "skip" },
            ],
            markdown: "updated",
            submittedBy: "editor",
          },
        }),
      }),
    );

    const { result } = renderHook(() => useSaveToConvexMutation(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync({
      articles: [{ slug: "lsd" }],
    });

    expect(response).toMatchObject({
      success: true,
      requestId: "req_123",
      savedItems: ["articles", "about"],
      warnings: ["warning-1"],
      revalidatedPaths: ["/lsd"],
      articleResult: {
        created: 1,
        updated: 2,
        errors: ["bad-slug"],
      },
      entry: {
        id: "entry_1",
        commit: {
          sha: "abc123",
        },
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
      },
    });
    expect(response.verification).toEqual([
      expect.objectContaining({
        target: "slug:lsd",
        found: true,
      }),
    ]);
  });

  it("includes Convex save diagnostics in failed save errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: "Editor access required for Convex writes.",
          details: ["Missing admin/editor membership."],
          code: "convex_editor_access_required",
          phase: "article-mutation",
          requestId: "save-test",
        }),
      }),
    );

    const { result } = renderHook(() => useSaveToConvexMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        articles: [{ slug: "lsd" }],
      }),
    ).rejects.toThrow(
      "Editor access required for Convex writes. Missing admin/editor membership. (code=convex_editor_access_required, phase=article-mutation, requestId=save-test)",
    );
  });
});
