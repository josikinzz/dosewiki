import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CitationReviewTab } from "./CitationReviewTab";
import type { CitationEvidenceRow, CitationReviewQueueSummary } from "./citationReviewModels";

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles: [],
    articleHydration: {
      isArticleHydrated: () => false,
      requestArticle: () => {},
    },
  }),
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: () => ({ allSubstanceRecords: [{ slug: "lsd", name: "LSD" }] }),
}));

const verifiedSupport = {
  sourceId: "source-1",
  sourceName: "Source",
  referenceId: "ref-1",
  supportingQuote: "Quote",
  rationale: "Rationale",
  verifiedQuote: {
    sourceId: "source-1",
    matchType: "exact" as const,
    startOffset: 0,
    endOffset: 5,
  },
};

function createRow(overrides: Partial<CitationEvidenceRow>): CitationEvidenceRow {
  return {
    slug: "lsd",
    section: "summary",
    claimKey: "summary:0",
    referenceIds: ["ref-1"],
    status: "supported",
    severity: "blocking",
    supports: [verifiedSupport],
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const rows: CitationEvidenceRow[] = [
  createRow({ claimKey: "summary:ready", claimText: "Ready claim", status: "supported" }),
  createRow({ claimKey: "summary:approved", claimText: "Approved claim", status: "approved" }),
  createRow({ claimKey: "summary:rejected", claimText: "Rejected claim", status: "rejected" }),
];

const openSummary: CitationReviewQueueSummary = {
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

function stubQueue(queueByFilter: Record<string, CitationReviewQueueSummary[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/citation-evidence/queue") {
        const status = url.searchParams.get("status") ?? "";
        return Response.json({ ok: true, queue: queueByFilter[status] ?? [] });
      }

      if (url.pathname === "/api/citation-evidence") {
        return Response.json({ ok: true, rows });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    }),
  );
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  stubQueue({ open: [openSummary], all: [openSummary] });
});

describe("CitationReviewTab", () => {
  it("loads the open queue by default and selects the first article", async () => {
    render(<CitationReviewTab />);

    expect(await screen.findByText("Ready claim")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/citation-evidence/queue?status=open", undefined);
    expect(fetch).toHaveBeenCalledWith("/api/citation-evidence?slug=lsd", undefined);

    const filter = screen.getByRole("group", { name: "Queue filter" });
    expect(within(filter).getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Open in Review" })).toHaveAttribute(
      "href",
      "/review/lsd",
    );
  });

  it("refetches the queue with the chosen filter and explains an empty result", async () => {
    const user = userEvent.setup();
    render(<CitationReviewTab />);

    await screen.findByText("Ready claim");
    const filter = screen.getByRole("group", { name: "Queue filter" });
    await user.click(within(filter).getByRole("button", { name: "Approved" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/citation-evidence/queue?status=approved", undefined),
    );
    expect(await screen.findByText("No evidence rows match this filter")).toBeInTheDocument();
    expect(
      screen.getByText(/No articles have evidence rows matching the approved filter/),
    ).toBeInTheDocument();

    // The filter control survives the empty state so the reviewer can switch back.
    const emptyFilter = screen.getByRole("group", { name: "Queue filter" });
    expect(within(emptyFilter).getByRole("button", { name: "Approved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(emptyFilter).getByRole("button", { name: "All" }));
    expect(await screen.findByText("Ready claim")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/citation-evidence/queue?status=all", undefined);
  });

  it("disables the verdict button a row already holds", async () => {
    const user = userEvent.setup();
    render(<CitationReviewTab />);

    async function expectDecisions(
      claimText: string,
      expected: { approveDisabled: boolean; rejectDisabled: boolean },
    ) {
      const toggle = await screen.findByRole("button", { name: new RegExp(claimText) });
      await user.click(toggle);
      const group = screen.getByRole("group", { name: "Evidence row decision actions" });
      const approve = within(group).getByRole("button", { name: "Approve" });
      const reject = within(group).getByRole("button", { name: "Reject" });
      expect(approve.hasAttribute("disabled")).toBe(expected.approveDisabled);
      expect(reject.hasAttribute("disabled")).toBe(expected.rejectDisabled);
      // Collapse again so only one decision group is mounted at a time.
      await user.click(toggle);
    }

    await expectDecisions("Ready claim", { approveDisabled: false, rejectDisabled: false });
    await expectDecisions("Approved claim", { approveDisabled: true, rejectDisabled: false });
    await expectDecisions("Rejected claim", { approveDisabled: false, rejectDisabled: true });
  });
});
