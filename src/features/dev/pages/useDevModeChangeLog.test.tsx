import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/dev/notices/devNoticeLifecycle", () => ({
  useDevNoticeChannel: () => ({
    notice: null,
    publish: vi.fn(),
    clear: vi.fn(),
  }),
}));

import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ChangelogFeedWindow } from "./useDevChangelogFeed";
import { useDevModeChangeLog } from "./useDevModeChangeLog";

const feedWindow: ChangelogFeedWindow = {
  loadedCount: 45,
  hasMore: false,
  atServerCap: false,
  loading: false,
  loadMore: vi.fn(),
};

function buildEntry(index: number): ChangeLogEntry {
  const padded = String(index).padStart(2, "0");

  return {
    id: `entry-${padded}`,
    createdAt: `2026-01-${padded}T00:00:00.000Z`,
    commit: {
      sha: "",
      url: "",
      message: `Entry ${padded}`,
    },
    articles: [{ id: index, title: `Article ${padded}`, slug: `article-${padded}` }],
    markdown: `# Entry ${padded}\n\n+ Changed article ${padded}`,
    submittedBy: null,
  };
}

describe("useDevModeChangeLog", () => {
  it("limits initially rendered entries and expands in batches", () => {
    const entries = Array.from({ length: 45 }, (_, index) => buildEntry(index + 1));
    const { result } = renderHook(() =>
      useDevModeChangeLog({ changeLogEntries: entries, enableStickyPanels: false, feedWindow }),
    );

    expect(result.current.filteredEntries).toHaveLength(45);
    expect(result.current.visibleEntries).toHaveLength(20);
    expect(result.current.canShowMoreEntries).toBe(true);

    act(() => {
      result.current.showMoreEntries();
    });

    expect(result.current.visibleEntries).toHaveLength(40);
    expect(result.current.canShowMoreEntries).toBe(true);

    act(() => {
      result.current.showMoreEntries();
    });

    expect(result.current.visibleEntries).toHaveLength(45);
    expect(result.current.canShowMoreEntries).toBe(false);
  });

  it("resets the visible batch after filters change", () => {
    const entries = Array.from({ length: 45 }, (_, index) => buildEntry(index + 1));
    const { result } = renderHook(() =>
      useDevModeChangeLog({ changeLogEntries: entries, enableStickyPanels: false, feedWindow }),
    );

    act(() => {
      result.current.showMoreEntries();
    });
    expect(result.current.visibleEntries).toHaveLength(40);

    act(() => {
      result.current.handleSearchChange({
        target: { value: "Entry" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.visibleEntries).toHaveLength(20);
  });
});
