import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { convexState } = vi.hoisted(() => ({
  convexState: {
    lastArgs: undefined as undefined | "skip" | { limit: number },
    entries: undefined as
      | undefined
      | Array<{
          entryId: string;
          createdAt: string;
          message: string;
          articles: Array<{ id: number; title: string; slug: string }>;
          markdown: string;
          submittedBy?: string | null;
        }>,
  },
}));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: (_name: unknown, args: "skip" | { limit: number }) => {
    convexState.lastArgs = args;
    return convexState.entries;
  },
}));

vi.mock("@/data/changelog/changeLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/changelog/changeLog")>();

  return {
    ...actual,
    initialChangeLogEntries: [
      {
        id: "static-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        commit: { sha: "a", url: "", message: "Static older" },
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        markdown: "static older",
        submittedBy: "ABC",
      },
      {
        id: "static-duplicate",
        createdAt: "2026-01-03T00:00:00.000Z",
        commit: { sha: "b", url: "", message: "Static duplicate wins" },
        articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
        markdown: "static duplicate",
        submittedBy: "DEF",
      },
      {
        id: "static-witchy",
        createdAt: "2026-01-02T00:00:00.000Z",
        commit: { sha: "c", url: "", message: "Legacy stamped save" },
        articles: [{ id: 3, title: "2C-B", slug: "2c-b" }],
        markdown: "legacy stamp",
        submittedBy: "WITCHY",
      },
    ],
  };
});

import { CHANGELOG_FEED_MAX_ROWS, CHANGELOG_FEED_PAGE_SIZE, useDevChangelogFeed } from "./useDevChangelogFeed";

const makeConvexEntries = (count: number, startIndex = 0) =>
  Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return {
      entryId: `convex-${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
      message: `Convex ${index}`,
      articles: [{ id: index, title: `Article ${index}`, slug: `article-${index}` }],
      markdown: `convex ${index}`,
      submittedBy: "ABC",
    };
  });

describe("useDevChangelogFeed", () => {
  beforeEach(() => {
    convexState.entries = undefined;
    convexState.lastArgs = undefined;
  });

  it("starts with sorted static entries", () => {
    const { result } = renderHook(() => useDevChangelogFeed({}));

    expect(result.current.changeLogEntries.map((entry) => entry.id)).toEqual([
      "static-duplicate",
      "static-witchy",
      "static-1",
    ]);
  });

  it("hydrates Convex entries, drops duplicate static IDs, and sorts newest first", async () => {
    convexState.entries = [
      {
        entryId: "convex-new",
        createdAt: "2026-01-04T00:00:00.000Z",
        message: "Convex newer",
        articles: [{ id: 3, title: "Ketamine", slug: "ketamine" }],
        markdown: "convex new",
        submittedBy: "ABC",
      },
      {
        entryId: "static-duplicate",
        createdAt: "2026-01-05T00:00:00.000Z",
        message: "Convex duplicate",
        articles: [{ id: 4, title: "Ignored", slug: "ignored" }],
        markdown: "convex duplicate",
        submittedBy: "ABC",
      },
    ];

    const { result } = renderHook(() => useDevChangelogFeed({}));

    await waitFor(() => {
      expect(result.current.changeLogEntries.map((entry) => entry.id)).toEqual([
        "convex-new",
        "static-duplicate",
        "static-witchy",
        "static-1",
      ]);
    });
    expect(result.current.changeLogEntries[1].markdown).toBe("static duplicate");
  });

  it("appends entries through the feed interface", () => {
    const { result } = renderHook(() => useDevChangelogFeed({}));

    act(() => {
      result.current.appendChangeLogEntryToState({
        id: "appended",
        createdAt: "2026-02-01T00:00:00.000Z",
        commit: { sha: "", url: "", message: "Appended" },
        articles: [],
        markdown: "appended",
        submittedBy: "ABC",
      });
    });

    expect(result.current.changeLogEntries[0].id).toBe("appended");
  });

  it("reports a closed window when Convex returns fewer rows than the page", async () => {
    convexState.entries = makeConvexEntries(3);

    const { result } = renderHook(() => useDevChangelogFeed({}));

    await waitFor(() => {
      expect(result.current.feedWindow.loadedCount).toBe(3);
    });
    expect(convexState.lastArgs).toEqual({ limit: CHANGELOG_FEED_PAGE_SIZE });
    expect(result.current.feedWindow).toMatchObject({
      hasMore: false,
      atServerCap: false,
      loading: false,
    });
  });

  it("offers older saves when a page comes back full and widens the query on loadMore", async () => {
    convexState.entries = makeConvexEntries(CHANGELOG_FEED_PAGE_SIZE);

    const { result, rerender } = renderHook(() => useDevChangelogFeed({}));

    await waitFor(() => {
      expect(result.current.feedWindow.hasMore).toBe(true);
    });
    expect(result.current.feedWindow.loadedCount).toBe(CHANGELOG_FEED_PAGE_SIZE);

    // The wider subscription answers undefined until the next page lands:
    // the rows already held must stay on screen and the window must read
    // as loading rather than empty.
    convexState.entries = undefined;
    act(() => {
      result.current.feedWindow.loadMore();
    });
    expect(convexState.lastArgs).toEqual({ limit: CHANGELOG_FEED_PAGE_SIZE * 2 });
    expect(result.current.feedWindow.loading).toBe(true);
    expect(result.current.feedWindow.hasMore).toBe(false);
    expect(result.current.changeLogEntries.length).toBeGreaterThanOrEqual(CHANGELOG_FEED_PAGE_SIZE);

    // A second click while loading must not skip a page.
    act(() => {
      result.current.feedWindow.loadMore();
    });
    expect(convexState.lastArgs).toEqual({ limit: CHANGELOG_FEED_PAGE_SIZE * 2 });

    convexState.entries = makeConvexEntries(CHANGELOG_FEED_PAGE_SIZE + 40);
    rerender();
    await waitFor(() => {
      expect(result.current.feedWindow.loadedCount).toBe(CHANGELOG_FEED_PAGE_SIZE + 40);
    });
    expect(result.current.feedWindow).toMatchObject({ hasMore: false, loading: false, atServerCap: false });
  });

  it("stops paging at the server cap and says so", async () => {
    convexState.entries = makeConvexEntries(CHANGELOG_FEED_MAX_ROWS);

    const { result } = renderHook(() => useDevChangelogFeed({}));

    await waitFor(() => {
      expect(result.current.feedWindow.loadedCount).toBe(CHANGELOG_FEED_MAX_ROWS);
    });
    expect(result.current.feedWindow).toMatchObject({ hasMore: false, atServerCap: true });
  });
});
