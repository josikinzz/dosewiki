import { describe, expect, it } from "vitest";
import {
  finalizeQueueSummaries,
  type CitationQueueSummary,
} from "./citationQueueFilter";

const summary = (
  slug: string,
  overrides: Partial<CitationQueueSummary>,
): CitationQueueSummary => ({
  slug,
  articleId: null,
  totalRows: 1,
  supportedCount: 0,
  needsSourceCount: 0,
  needsReviewCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  blockingCount: 0,
  blockingNeedsSourceCount: 0,
  blockingNeedsReviewCount: 0,
  blockingSupportedCount: 0,
  blockingRejectedCount: 0,
  diagnosticErrorCount: 0,
  diagnosticWarningCount: 0,
  sectionIds: [],
  updatedAt: null,
  ...overrides,
});

const summaries = [
  summary("lsd", {
    totalRows: 3,
    supportedCount: 1,
    rejectedCount: 1,
    blockingNeedsSourceCount: 1,
    sectionIds: ["summary", "dosage"],
  }),
  summary("mdma", {
    approvedCount: 1,
    sectionIds: ["summary"],
  }),
  summary("dmt", {
    needsReviewCount: 1,
    blockingNeedsReviewCount: 1,
    sectionIds: ["effects"],
  }),
];

describe("citation queue summary filtering", () => {
  it("preserves status membership and queue ordering for compact SQL summaries", () => {
    expect(finalizeQueueSummaries(summaries, "open").map((entry) => entry.slug)).toEqual(["lsd", "dmt"]);
    expect(finalizeQueueSummaries(summaries, "approved").map((entry) => entry.slug)).toEqual(["mdma"]);
    expect(finalizeQueueSummaries(summaries, "rejected").map((entry) => entry.slug)).toEqual(["lsd"]);
    expect(finalizeQueueSummaries(summaries, "all").map((entry) => entry.slug)).toEqual(["lsd", "dmt", "mdma"]);
    expect(finalizeQueueSummaries(summaries, "all")[0]?.sectionIds).toEqual(["dosage", "summary"]);
  });
});
