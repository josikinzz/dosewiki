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
  error: null,
  retrying: false,
  retry: () => {},
  archivedIds: new Set(),
};

/** Each save's summary line, which is the disclosure for its diff. */
const toggles = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-change-toggle]"));

function makeController(overrides: Partial<ChangeLogController> = {}): ChangeLogController {
  const entries = overrides.filteredEntries ?? ENTRIES;
  return {
    notice: null,
    feedWindow: IDLE_WINDOW,
    totalEntriesCount: ENTRIES.length,
    filters: { articleSlug: null, startDate: null, endDate: null, searchQuery: "", submitter: null },
    articleOptions: [PREGABALIN, { slug: "fentanyl", title: "Fentanyl" }],
    articleFrequency: [],
    submitterOptions: [
      { key: "JOSIE", count: 1 },
      { key: "OLDHANDLE", count: 1 },
    ],
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
    handleSubmitterSelect: vi.fn(),
    handleSearchChange: vi.fn(),
    setSearchQuery: vi.fn(),
    handleDateChange: () => vi.fn(),
    applyQuickDateRange: vi.fn(),
    setDateRange: vi.fn(),
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

    expect(toggles()).toHaveLength(2);
    for (const toggle of toggles()) expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The summary line names the save it opens.
    expect(toggles()[0]).toHaveAccessibleName(/Reworded \d+ words/);
    await user.click(toggles()[0]);

    expect(screen.getByText(/Rare reports of psychosis at high doses/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy diff" })).toBeInTheDocument();
    expect(toggles()[0]).toHaveAttribute("aria-expanded", "true");
    expect(toggles()[0]).toHaveAttribute("aria-controls", "change-log-diff-inline-1");

    await user.click(screen.getByRole("button", { name: "Collapse every diff" }));
    expect(screen.queryByText(/Rare reports of psychosis at high doses/)).not.toBeInTheDocument();
    for (const toggle of toggles()) expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "Expand every diff" }));
    for (const toggle of toggles()) expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps filtering and the public link for every article of an open save", async () => {
    const user = userEvent.setup();
    const focusArticleFilter = vi.fn();
    render(<DevModeChangeLogTab controller={makeController({ focusArticleFilter })} />);

    await user.click(toggles()[1]);
    await user.click(screen.getByRole("button", { name: /^Fentanyl, show only its saves/ }));
    expect(focusArticleFilter).toHaveBeenCalledWith("fentanyl");
    expect(screen.getByRole("link", { name: "Open Fentanyl article in a new tab" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "Download .diff" })).toBeInTheDocument();
  });

  it("names savers from the contributor directory", () => {
    render(
      <DevModeChangeLogTab
        controller={makeController()}
        contributorProfiles={[
          { key: "JOSIE", displayName: "Josie Kins", aliases: [], avatarUrl: null, bio: "", links: [], hasCustomBio: false },
        ]}
      />,
    );
    expect(screen.getByText("by Josie Kins")).toBeInTheDocument();
    expect(screen.queryByText(/JOSIE/)).not.toBeInTheDocument();
  });

  it("shows only the filtered article's part of a save that touched several", async () => {
    const user = userEvent.setup();
    render(
      <DevModeChangeLogTab
        controller={makeController({
          filters: { articleSlug: "fentanyl", startDate: null, endDate: null, searchQuery: "", submitter: null },
          activeFilterCount: 1,
          filteredEntries: [ENTRIES[1]],
          visibleEntries: [ENTRIES[1]],
        })}
      />,
    );
    await user.click(toggles()[0]);
    expect(screen.getByText("Showing the Fentanyl part of this save.")).toBeInTheDocument();
    expect(screen.queryByText(/A gabapentinoid/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the whole save" }));
    expect(screen.getByText(/A gabapentinoid/)).toBeInTheDocument();
  });

  it("lists active filters as removable chips", async () => {
    const user = userEvent.setup();
    const handleArticleSelect = vi.fn();
    const setSearchQuery = vi.fn();
    render(
      <DevModeChangeLogTab
        controller={makeController({
          filters: { articleSlug: "pregabalin", startDate: null, endDate: null, searchQuery: "psychosis", submitter: null },
          activeFilterCount: 2,
          handleArticleSelect,
          setSearchQuery,
        })}
      />,
    );
    const group = screen.getByRole("group", { name: "Active filters, 2" });
    await user.click(within(group).getByRole("button", { name: "Remove the article filter" }));
    expect(handleArticleSelect).toHaveBeenCalledWith("__all__");
    await user.click(within(group).getByRole("button", { name: "Clear the search" }));
    expect(setSearchQuery).toHaveBeenCalledWith("");
  });

  it("draws a failed read in the tool with a retry, and keeps the archive listed", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <DevModeChangeLogTab
        controller={makeController({
          feedWindow: { ...IDLE_WINDOW, loadedCount: 0, error: "Editor read failed (500).", retry },
        })}
      />,
    );
    expect(screen.getByText("Could not load the change log")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("says an empty history is empty and points to where saves start", () => {
    render(
      <DevModeChangeLogTab
        controller={makeController({
          filteredEntries: [],
          visibleEntries: [],
          totalEntriesCount: 0,
          latestEntry: null,
          feedWindow: { ...IDLE_WINDOW, loadedCount: 0 },
        })}
      />,
    );
    expect(screen.getByText("No saves logged yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Substances/ })).toHaveAttribute("href", "/dev/articles");
  });

  it("stands in skeleton rows while the first page loads", () => {
    render(
      <DevModeChangeLogTab
        controller={makeController({ feedWindow: { ...IDLE_WINDOW, loadedCount: 0, loading: true } })}
      />,
    );
    expect(screen.getByText("Loading saves", { selector: "span.sr-only" })).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("moves between saves with j and k and focuses search with /", async () => {
    const user = userEvent.setup();
    render(<DevModeChangeLogTab controller={makeController()} />);
    await user.keyboard("j");
    expect(toggles()[0]).toHaveFocus();
    await user.keyboard("j");
    expect(toggles()[1]).toHaveFocus();
    await user.keyboard("k");
    expect(toggles()[0]).toHaveFocus();
    await user.keyboard("/");
    expect(screen.getByRole("searchbox")).toHaveFocus();
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
    // The window status, not a day's count.
    expect(screen.queryByText("2 saves", { selector: "[aria-live]" })).not.toBeInTheDocument();

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

    expect(screen.getByText("2 saves", { selector: "[aria-live]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Any date" })).toBeInTheDocument();
    expect(screen.queryByText("All time")).not.toBeInTheDocument();
  });
});
