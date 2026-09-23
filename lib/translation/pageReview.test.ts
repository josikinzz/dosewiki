import { describe, expect, it } from "vitest";
import { isFullyReviewed, pageReviewState } from "./pageReview";

describe("pageReviewState", () => {
  it("counts every paragraph with a current approval and keeps the latest approval date", () => {
    const state = pageReviewState(["apply", "apply"], [1_000, 3_000]);
    expect(state).toEqual({ reviewed: 2, total: 2, latestApprovedAt: 3_000 });
    expect(isFullyReviewed(state)).toBe(true);
  });

  it("counts a paragraph in apply-recheck as not reviewed", () => {
    const state = pageReviewState(["apply", "apply-recheck"], [1_000, 5_000]);
    expect(state).toEqual({ reviewed: 1, total: 2, latestApprovedAt: 1_000 });
    expect(isFullyReviewed(state)).toBe(false);
  });

  it("counts stale and missing approvals as machine paragraphs", () => {
    const state = pageReviewState(["stale", null, "apply"], [9_000, null, 2_000]);
    expect(state).toEqual({ reviewed: 1, total: 3, latestApprovedAt: 2_000 });
  });

  it("never calls an empty page reviewed", () => {
    expect(isFullyReviewed(pageReviewState([], []))).toBe(false);
  });
});
