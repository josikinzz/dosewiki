import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CitationQueuePanel } from "./CitationQueuePanel";
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

describe("CitationQueuePanel", () => {
  it("exposes Open in Review as a named row action beside the selectable row", async () => {
    const user = userEvent.setup();
    const onSelectSlug = vi.fn();
    render(
      <CitationQueuePanel
        queue={[summary]}
        selectedSlug={null}
        articleTitleBySlug={new Map([["lsd", "LSD"]])}
        onSelectSlug={onSelectSlug}
      />,
    );

    const link = screen.getByRole("link", { name: "Open in Review" });
    expect(link).toHaveAttribute("href", "/review/lsd");
    expect(link.closest("button")).toBeNull();

    await user.click(screen.getByRole("button", { name: /LSD/ }));
    expect(onSelectSlug).toHaveBeenCalledWith("lsd");
  });
});
