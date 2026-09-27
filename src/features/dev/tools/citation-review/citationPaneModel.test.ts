import { describe, expect, it } from "vitest";

import {
  describeConflict,
  describeQueueTotals,
  describeTally,
  rowsChangedSince,
  rowsMovedSinceDecision,
  tallyRows,
} from "./citationPaneModel";
import { formatCitationSectionLabel, type CitationEvidenceRow, type CitationReviewQueueSummary } from "./citationReviewModels";

function row(overrides: Partial<CitationEvidenceRow>): CitationEvidenceRow {
  return {
    section: "summary",
    claimKey: "summary:0",
    referenceIds: [],
    status: "supported",
    severity: "blocking",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const summary = (overrides: Partial<CitationReviewQueueSummary>): CitationReviewQueueSummary => ({
  slug: "lsd",
  articleId: 1,
  totalRows: 3,
  supportedCount: 1,
  needsSourceCount: 1,
  needsReviewCount: 0,
  approvedCount: 1,
  rejectedCount: 0,
  blockingCount: 2,
  blockingNeedsSourceCount: 1,
  blockingNeedsReviewCount: 0,
  blockingSupportedCount: 1,
  blockingRejectedCount: 0,
  diagnosticErrorCount: 0,
  diagnosticWarningCount: 0,
  sectionIds: ["summary"],
  updatedAt: null,
  ...overrides,
});

describe("citationPaneModel", () => {
  it("counts an article's rows and says them in one line", () => {
    const tally = tallyRows([
      row({ claimKey: "a" }),
      row({ claimKey: "b", status: "needs_source" }),
      row({ claimKey: "c", status: "needs_review", severity: "non_blocking" }),
      row({ claimKey: "d", status: "approved" }),
      row({ claimKey: "e", status: "rejected" }),
    ]);
    expect(tally).toMatchObject({ total: 5, ready: 1, blockingGaps: 2, otherGaps: 1, accepted: 1, rejected: 1 });
    expect(describeTally(tally)).toBe("5 rows: 1 ready to approve, 2 blocking gaps, 1 other gap, 1 accepted, 1 rejected");
  });

  it("sums the queue per filter, and names an empty one", () => {
    expect(describeQueueTotals([summary({}), summary({ slug: "mdma", supportedCount: 2 })], "open")).toBe(
      "2 articles with undecided evidence: 3 rows ready to approve, 2 blocking gaps.",
    );
    expect(describeQueueTotals([], "approved")).toBe("Nothing is listed under Accepted.");
  });

  it("finds rows changed or gone since they were shown, and only among the ones decided", () => {
    const shown = [row({ claimKey: "a" }), row({ claimKey: "b" }), row({ claimKey: "c" })];
    const fresh = [row({ claimKey: "a" }), row({ claimKey: "b", status: "approved", updatedAt: "2026-05-02T00:00:00.000Z" })];
    expect(rowsChangedSince(shown, fresh, ["a"])).toEqual([]);
    expect(rowsChangedSince(shown, fresh, ["a", "b", "c"])).toEqual(["b", "c"]);
  });

  it("refuses an undo over rows decided again since", () => {
    const decision = { status: "approved" as const, slug: "lsd", prior: [{ claimKey: "a", status: "supported" as const }] };
    expect(rowsMovedSinceDecision(decision, [row({ claimKey: "a", status: "approved" })])).toEqual([]);
    expect(rowsMovedSinceDecision(decision, [row({ claimKey: "a", status: "rejected" })])).toEqual(["a"]);
    expect(describeConflict(1, true)).toMatch(/nothing was undone/);
  });

  it("names sections in sentence case from the catalog", () => {
    expect(formatCitationSectionLabel("harm_potential")).toBe("Harm potential");
    expect(formatCitationSectionLabel("history_culture")).toBe("History & culture");
    expect(formatCitationSectionLabel("made_up")).toBe("Made up");
  });
});
