import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ChangelogFeedWindow } from "./useDevChangelogFeed";
import { toLocalDateInputValue } from "./changeLogModel";
import { useDevModeChangeLog } from "./useDevModeChangeLog";

const feedWindow: ChangelogFeedWindow = {
  loadedCount: 45,
  hasMore: false,
  atServerCap: false,
  loading: false,
  loadMore: vi.fn(),
  error: null,
  retrying: false,
  retry: vi.fn(),
  archivedIds: new Set(),
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
    submittedBy: index % 2 === 0 ? "JOSIE" : null,
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

  it("filters by who saved, counts a date range as one filter, and searches the row's own words", () => {
    const entries = Array.from({ length: 6 }, (_, index) => buildEntry(index + 1));
    const { result } = renderHook(() =>
      useDevModeChangeLog({ changeLogEntries: entries, enableStickyPanels: false, feedWindow }),
    );

    expect(result.current.submitterOptions).toEqual([{ key: "JOSIE", count: 3 }]);
    act(() => {
      result.current.handleSubmitterSelect("josie");
    });
    expect(result.current.filters.submitter).toBe("JOSIE");
    expect(result.current.filteredEntries.map((entry) => entry.id)).toEqual(["entry-02", "entry-04", "entry-06"]);
    expect(result.current.activeFilterCount).toBe(1);

    act(() => {
      result.current.handleSubmitterSelect(null);
      // Local days, as the filter cuts them.
      result.current.setDateRange(
        toLocalDateInputValue(new Date(entries[1].createdAt)),
        toLocalDateInputValue(new Date(entries[2].createdAt)),
      );
    });
    expect(result.current.activeFilterCount).toBe(1);
    expect(result.current.filteredEntries.map((entry) => entry.id)).toEqual(["entry-02", "entry-03"]);

    act(() => {
      result.current.clearFilters();
      // "Updated the article" is the row's headline for every bulk-style save here.
      result.current.setSearchQuery("updated the article");
    });
    expect(result.current.filteredEntries).toHaveLength(6);
  });
});
