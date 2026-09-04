import { describe, expect, it } from "vitest";
import {
  accumulateQueueSummary,
  finalizeQueueSummaries,
  mergeQueueSummary,
  type CitationQueueSummary,
  type CitationQueueSummaryRow,
} from "./citationQueueFilter";

const rows: CitationQueueSummaryRow[] = [
  { slug: "lsd", articleId: 1, section: "summary", status: "supported", severity: "blocking", updatedAt: "2026-01-01T00:00:00.000Z" },
  { slug: "lsd", articleId: 1, section: "dosage", status: "needs_source", severity: "blocking", updatedAt: "2026-03-01T00:00:00.000Z", diagnostics: [{ severity: "error" }, { severity: "warning" }] },
  { slug: "lsd", articleId: 1, section: "dosage", status: "rejected", severity: "non_blocking", updatedAt: "2026-02-01T00:00:00.000Z" },
  { slug: "mdma", articleId: null, section: "summary", status: "approved", severity: "blocking", updatedAt: "2026-01-05T00:00:00.000Z" },
  { slug: "mdma", section: "effects", status: "approved", severity: "non_blocking", updatedAt: "2026-01-06T00:00:00.000Z" },
  { slug: "dmt", section: "summary", status: "needs_review", severity: "blocking", updatedAt: "2026-01-02T00:00:00.000Z" },
];

function summarize(rowsInOrder: CitationQueueSummaryRow[], pageSize: number): Map<string, CitationQueueSummary> {
  const merged = new Map<string, CitationQueueSummary>();
  for (let start = 0; start < rowsInOrder.length; start += pageSize) {
    const page = new Map<string, CitationQueueSummary>();
    for (const row of rowsInOrder.slice(start, start + pageSize)) {
      accumulateQueueSummary(page, row);
    }
    for (const partial of page.values()) {
      mergeQueueSummary(merged, partial);
    }
  }
  return merged;
}

describe("citation queue summary paging", () => {
  it("merges partial page summaries into the same totals as a single pass", () => {
    const single = summarize(rows, rows.length);
    for (const pageSize of [1, 2, 4]) {
      expect(finalizeQueueSummaries(summarize(rows, pageSize).values(), "all")).toEqual(
        finalizeQueueSummaries(single.values(), "all"),
      );
    }

    const lsd = single.get("lsd");
    expect(lsd).toMatchObject({
      articleId: 1,
      totalRows: 3,
      supportedCount: 1,
      needsSourceCount: 1,
      rejectedCount: 1,
      blockingCount: 2,
      blockingSupportedCount: 1,
      blockingNeedsSourceCount: 1,
      blockingRejectedCount: 0,
      diagnosticErrorCount: 1,
      diagnosticWarningCount: 1,
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(lsd?.sectionIds).toEqual(["summary", "dosage"]);
  });

  it("filters after merging so a fully approved article only drains once all its pages are counted", () => {
    const merged = summarize(rows, 1);
    // Both hold one unresolved blocking row; lsd's ready row breaks the tie.
    expect(finalizeQueueSummaries(merged.values(), "open").map((entry) => entry.slug)).toEqual(["lsd", "dmt"]);
    expect(finalizeQueueSummaries(merged.values(), "approved").map((entry) => entry.slug)).toEqual(["mdma"]);
    expect(finalizeQueueSummaries(merged.values(), "rejected").map((entry) => entry.slug)).toEqual(["lsd"]);
    expect(finalizeQueueSummaries(merged.values(), "all")[0]?.sectionIds).toEqual(["dosage", "summary"]);
  });
});
