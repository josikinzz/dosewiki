import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { convexState } = vi.hoisted(() => ({
  convexState: {
    enabled: false,
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

vi.mock("convex/react", () => ({
  useQuery: () => convexState.entries,
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: { changelog: { getRecent: "changelog:getRecent" } },
}));

vi.mock("@/lib/convex", () => ({
  isConvexEnabled: () => convexState.enabled,
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

import { useDevChangelogFeed } from "./useDevChangelogFeed";

describe("useDevChangelogFeed", () => {
  beforeEach(() => {
    convexState.enabled = false;
    convexState.entries = undefined;
  });

  it("starts with sorted static entries", () => {
    const { result } = renderHook(() => useDevChangelogFeed({ profileKey: "" }));

    expect(result.current.changeLogEntries.map((entry) => entry.id)).toEqual([
      "static-duplicate",
      "static-witchy",
      "static-1",
    ]);
  });

  it("hydrates Convex entries, drops duplicate static IDs, and sorts newest first", async () => {
    convexState.enabled = true;
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

    const { result } = renderHook(() => useDevChangelogFeed({ profileKey: "" }));

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

  it("filters profile history by submitted profile key", () => {
    convexState.enabled = true;
    convexState.entries = [
      {
        entryId: "convex-abc",
        createdAt: "2026-01-04T00:00:00.000Z",
        message: "Convex ABC",
        articles: [],
        markdown: "abc",
        submittedBy: "ABC",
      },
    ];

    const { result } = renderHook(() => useDevChangelogFeed({ profileKey: "ABC" }));

    expect(result.current.profileHistory.map((entry) => entry.id)).toEqual([
      "convex-abc",
      "static-1",
    ]);
  });

  it("resolves legacy WITCHY stamps to the LYREA profile history", () => {
    convexState.enabled = false;
    convexState.entries = undefined;

    const { result } = renderHook(() => useDevChangelogFeed({ profileKey: "LYREA" }));

    expect(result.current.profileHistory.map((entry) => entry.id)).toEqual(["static-witchy"]);
    // The legacy login key sees the merged history too.
    expect(result.current.getProfileHistory("WITCHY").map((entry) => entry.id)).toEqual([
      "static-witchy",
    ]);
  });

  it("appends entries through the feed interface", () => {
    const { result } = renderHook(() => useDevChangelogFeed({ profileKey: "ABC" }));

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

    expect(result.current.profileHistory[0].id).toBe("appended");
  });
});
