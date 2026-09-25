import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CitationOpenInReview, CitationQueuePanel } from "./CitationQueuePanel";
import type { CitationReviewQueueSummary } from "./citationReviewModels";

const summary: CitationReviewQueueSummary = {
  slug: "lsd",
  articleId: 1,
  totalRows: 3,
  supportedCount: 1,
  needsSourceCount: 0,
  needsReviewCount: 0,
  approvedCount: 1,
  rejectedCount: 1,
  blockingCount: 3,
  blockingNeedsSourceCount: 0,
  blockingNeedsReviewCount: 0,
  blockingSupportedCount: 1,
  blockingRejectedCount: 1,
  diagnosticErrorCount: 0,
  diagnosticWarningCount: 0,
  sectionIds: ["summary"],
  updatedAt: "2026-05-01T00:00:00.000Z",
};

const titles = new Map([
  ["lsd", "LSD"],
  ["mdma", "MDMA"],
]);

describe("CitationQueuePanel", () => {
  it("is a listbox the arrow keys move through, and a click selects", async () => {
    const user = userEvent.setup();
    const onSelectSlug = vi.fn();
    render(
      <CitationQueuePanel
        queue={[summary, { ...summary, slug: "mdma", articleId: 2 }]}
        selectedSlug="lsd"
        articleTitleBySlug={titles}
        onSelectSlug={onSelectSlug}
      />,
    );

    const listbox = screen.getByRole("listbox", { name: "Citation queue" });
    expect(within(listbox).getByRole("option", { selected: true })).toHaveTextContent("LSD");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onSelectSlug).toHaveBeenLastCalledWith("mdma");

    await user.click(within(listbox).getByText("LSD"));
    expect(onSelectSlug).toHaveBeenLastCalledWith("lsd");
    // Rows hold no links of their own; the selected article's summary carries Open in Review.
    expect(within(listbox).queryByRole("link")).not.toBeInTheDocument();
  });

  it("links the selected article to the Review portal", () => {
    render(<CitationOpenInReview slug="lsd" />);
    expect(screen.getByRole("link", { name: "Open in Review" })).toHaveAttribute("href", "/review/lsd");
  });
});
