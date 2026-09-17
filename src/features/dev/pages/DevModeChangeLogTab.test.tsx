import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import { DevModeChangeLogTab } from "./DevModeChangeLogTab";
import type { ChangelogFeedWindow } from "./useDevChangelogFeed";
import type { ChangeLogController } from "./useDevModeChangeLog";

const PREGABALIN = { id: 1, title: "Pregabalin", slug: "pregabalin" };

const ENTRIES: ChangeLogEntry[] = [
  {
    id: "inline-1",
    createdAt: "2026-09-03T03:26:00.000Z",
    // Stored inline-edit messages carry the editor's own separator glyph.
    commit: { sha: "", url: "", message: "Inline edit \u2014 harm_potential.psychosis.description" },
    articles: [PREGABALIN],
    markdown:
      "# Pregabalin · #1\n\n@@ harm_potential.psychosis.description @@\n- Rare reports of psychosis.\n+ Rare reports of psychosis at high doses.\n+ Risk rises with sleep loss.",
    submittedBy: "OLDHANDLE",
  },
  {
    id: "bulk-1",
    createdAt: "2026-09-02T10:00:00.000Z",
    commit: { sha: "", url: "", message: "Dev editor update - 9/2/2026, 10:00:00 AM" },
    articles: [PREGABALIN, { id: 2, title: "Fentanyl", slug: "fentanyl" }],
    markdown: "# Pregabalin · #1\n\n-  \"summary\": \"\"\n+  \"summary\": \"A gabapentinoid.\"\n\n# Fentanyl · #2\n\n+  \"tags\": []",
    submittedBy: "JOSIE",
  },
];

const IDLE_WINDOW: ChangelogFeedWindow = {
  loadedCount: 2,
  hasMore: false,
  atServerCap: false,
  loading: false,
  loadMore: () => {},
};

function makeController(overrides: Partial<ChangeLogController> = {}): ChangeLogController {
  const entries = overrides.filteredEntries ?? ENTRIES;
  return {
    notice: null,
    feedWindow: IDLE_WINDOW,
    totalEntriesCount: ENTRIES.length,
    filters: { articleSlug: null, startDate: null, endDate: null, searchQuery: "" },
    articleOptions: [PREGABALIN, { slug: "fentanyl", title: "Fentanyl" }],
    articleFrequency: [],
    filteredEntries: entries,
    visibleEntries: entries,
    visibleEntriesCount: entries.length,
    canShowMoreEntries: false,
    activeFilterCount: 0,
    latestEntry: entries[0] ?? null,
    entryFeedback: null,
    clearEntryFeedback: vi.fn(),
    filtersCardClassName: "w-full",
    handleArticleSelect: vi.fn(),
    handleSearchChange: vi.fn(),
    handleDateChange: () => vi.fn(),
    applyQuickDateRange: vi.fn(),
    clearFilters: vi.fn(),
    clearNotice: vi.fn(),
    focusArticleFilter: vi.fn(),
    pushNotice: vi.fn(),
    showMoreEntries: vi.fn(),
    handleCopyEntry: vi.fn(async () => {}),
    handleDownloadEntry: vi.fn(),
    ...overrides,
  };
}

describe("DevModeChangeLogTab", () => {
  it("summarises each save in plain words and keeps the diff closed until asked", async () => {
    const user = userEvent.setup();
    render(<DevModeChangeLogTab controller={makeController()} />);

    const [inline] = screen.getAllByRole("article");
    expect(within(inline).getByText(/^Reworded \d+ words$/)).toBeInTheDocument();
    expect(within(inline).getByText(/Harm Potential › Psychosis › Description/)).toBeInTheDocument();
    expect(within(inline).getByLabelText("2 lines added, 1 line removed")).toBeInTheDocument();
    expect(screen.queryByText("harm_potential.psychosis.description")).not.toBeInTheDocument();
    expect(screen.getByText("Updated 2 articles")).toBeInTheDocument();

    expect(screen.queryByText("Copy diff")).not.toBeInTheDocument();
    expect(screen.queryByText(/Rare reports of psychosis at high doses/)).not.toBeInTheDocument();

    const showButtons = screen.getAllByRole("button", { name: "Show the diff" });
    expect(showButtons).toHaveLength(2);
    await user.click(showButtons[0]);

    expect(screen.getByText(/Rare reports of psychosis at high doses/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide the diff" })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Collapse every diff" }));
    expect(screen.queryByText(/Rare reports of psychosis at high doses/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Show the diff" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Expand every diff" }));
    expect(screen.getAllByRole("button", { name: "Hide the diff" })).toHaveLength(2);
  });

  it("states the loaded window and loads older saves from the end of the list", async () => {
    const user = userEvent.setup();
    const loadMore = vi.fn();
    render(
      <DevModeChangeLogTab
        controller={makeController({
          feedWindow: { ...IDLE_WINDOW, loadedCount: 100, hasMore: true, loadMore },
        })}
      />,
    );

    expect(screen.getByText("Latest 100 saves")).toBeInTheDocument();
    expect(screen.getByText(/Only the latest 100 saves are loaded/)).toBeInTheDocument();
    expect(screen.queryByText("2 saves")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load older saves" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("does not present a filtered miss as final while older saves are unloaded", async () => {
    const user = userEvent.setup();
    const loadMore = vi.fn();
    render(
      <DevModeChangeLogTab
        controller={makeController({
          filteredEntries: [],
          visibleEntries: [],
          activeFilterCount: 1,
          feedWindow: { ...IDLE_WINDOW, loadedCount: 100, hasMore: true, loadMore },
        })}
      />,
    );

    expect(screen.getByText("No loaded saves match these filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load older saves" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("says when the server cap is reached instead of offering more", () => {
    render(
      <DevModeChangeLogTab
        controller={makeController({
          feedWindow: { ...IDLE_WINDOW, loadedCount: 500, atServerCap: true },
        })}
      />,
    );

    expect(screen.getByText("Latest 500 saves")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load older saves" })).not.toBeInTheDocument();
    expect(screen.getByText(/Older saves are not loaded: this page holds the latest 500/)).toBeInTheDocument();
  });

  it("counts every loaded save once the window is closed", () => {
    render(<DevModeChangeLogTab controller={makeController()} />);

    expect(screen.getByText("2 saves")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Any date" })).toBeInTheDocument();
    expect(screen.queryByText("All time")).not.toBeInTheDocument();
  });
});
