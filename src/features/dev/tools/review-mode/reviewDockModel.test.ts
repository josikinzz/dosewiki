import { describe, expect, it } from "vitest";

import {
  describeProgress,
  describeReviewRefusal,
  describeReviewRole,
  describeStatusChange,
  REVIEW_FREEZE_COPY,
} from "./reviewDockModel";

describe("describeReviewRefusal", () => {
  it("reads the write freeze as the freeze, never the server's words", () => {
    expect(describeReviewRefusal(503, { code: "DATA_WRITES_FROZEN", error: "Data writes are frozen (DATA_WRITES_FROZEN)" }, "fallback"))
      .toEqual({ kind: "frozen", message: REVIEW_FREEZE_COPY });
  });

  it("says a lapsed sign-in wrote nothing", () => {
    expect(describeReviewRefusal(401, { error: "Authentication required." }, "fallback").kind).toBe("expired");
  });

  it("names who may sign off on the admin floor", () => {
    expect(describeReviewRefusal(403, { error: "Admin access required." }, "fallback"))
      .toEqual({ kind: "forbidden", message: "Only admins can mark an article reviewed." });
  });

  it("keeps any other route sentence, or the fallback", () => {
    expect(describeReviewRefusal(400, { error: "A valid review status is required." }, "fallback").message).toBe("A valid review status is required.");
    expect(describeReviewRefusal(500, null, "fallback")).toEqual({ kind: "failed", message: "fallback" });
    // A 503 without the freeze code is an ordinary failure.
    expect(describeReviewRefusal(503, { error: "Down" }, "fallback").kind).toBe("failed");
  });
});

describe("dock words", () => {
  it("says the progress, and when everything is done", () => {
    expect(describeProgress(9, 22)).toBe("9 of 22 reviewed, 13 to go");
    expect(describeProgress(22, 22)).toBe("All 22 reviewed");
  });

  it("says what each role may do", () => {
    expect(describeReviewRole({ canSignOff: true, canRecommend: false, recommendation: null })).toBeNull();
    expect(describeReviewRole({ canSignOff: false, canRecommend: false, recommendation: null })).toBe("Only admins can sign off a review.");
    expect(describeReviewRole({ canSignOff: false, canRecommend: true, recommendation: "none" })).toMatch(/Recommend reviewed asks an admin/);
    expect(describeReviewRole({ canSignOff: false, canRecommend: true, recommendation: "pending" })).toMatch(/Change Review/);
    expect(describeReviewRole({ canSignOff: false, canRecommend: true, recommendation: "stale" })).toMatch(/recommend it again/);
  });

  it("puts a status change in the past tense", () => {
    expect(describeStatusChange("completed", "LSD")).toBe("Marked LSD reviewed.");
    expect(describeStatusChange("in_progress", "LSD")).toBe("Held LSD.");
    expect(describeStatusChange("needed", "LSD")).toBe("Marked LSD not reviewed.");
  });
});
