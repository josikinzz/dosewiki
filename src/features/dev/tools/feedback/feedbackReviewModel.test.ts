import { describe, expect, it } from "vitest";

import { describeEmptyQueue, describeFilterCount, holdOf, isFreezeRefusal } from "./feedbackReviewModel";

const counts = { new: 0, reviewing: 2, resolved: 3, rejected: 0, spam: 1 };

describe("holdOf", () => {
  it("reads New as open and a claim from the log's move into Reviewing", () => {
    expect(holdOf({ status: "new" }, "me@x")).toEqual({ kind: "open" });
    const log = [
      { at: "2026-01-01T00:00:00Z", actor: "Me@X", from: "new" as const, to: "reviewing" as const },
      // A linked change leaves the status where it was and never reads as the claim.
      { at: "2026-01-02T00:00:00Z", actor: "other@x", from: "reviewing" as const, to: "reviewing" as const },
    ];
    expect(holdOf({ status: "reviewing", decision_log: log }, "me@x")).toEqual({ kind: "mine", at: "2026-01-01T00:00:00Z" });
    expect(holdOf({ status: "reviewing", decision_log: log }, "someone@x")).toEqual({
      kind: "other",
      by: "Me@X",
      at: "2026-01-01T00:00:00Z",
    });
  });

  it("falls back to the stored reviewer, and says so when nobody is recorded", () => {
    expect(holdOf({ status: "reviewing", reviewed_by: "a@x" }, null)).toMatchObject({ kind: "other", by: "a@x" });
    expect(holdOf({ status: "reviewing" }, "me@x")).toEqual({ kind: "unknown" });
  });

  it("names who decided a closed item", () => {
    const hold = holdOf(
      { status: "resolved", decision_log: [{ at: "2026-01-03T00:00:00Z", actor: "me@x", from: "reviewing", to: "resolved" }] },
      "me@x",
    );
    expect(hold).toEqual({ kind: "decided", status: "resolved", by: "me@x", at: "2026-01-03T00:00:00Z", mine: true });
  });
});

describe("describeEmptyQueue", () => {
  it("names a search that matched nothing", () => {
    expect(describeEmptyQueue("new", counts, "dose", "article feedback")).toEqual({
      kind: "search",
      message: "No new article feedback matches “dose”.",
      found: [
        { status: "reviewing", count: 2 },
        { status: "resolved", count: 3 },
        { status: "spam", count: 1 },
      ],
    });
  });

  it("says how much waits when a decided status is empty", () => {
    expect(describeEmptyQueue("rejected", counts, "", "site feedback")).toEqual({
      kind: "filtered",
      message: "No rejected site feedback. 2 still wait on a decision.",
      elsewhere: 6,
    });
    expect(describeEmptyQueue("new", counts, "", "site feedback").message).toBe(
      "No new site feedback. 6 items are under other statuses.",
    );
  });

  it("is all clear when the source has nothing at all", () => {
    expect(describeEmptyQueue("all", { new: 0, reviewing: 0, resolved: 0, rejected: 0, spam: 0 }, "", "site feedback")).toEqual({
      kind: "clear",
      message: "All clear. No site feedback yet.",
    });
  });
});

describe("words", () => {
  it("counts a filter in its own words", () => {
    expect(describeFilterCount(4, "unresolved")).toBe("4 unresolved");
    expect(describeFilterCount(12, "all")).toBe("12 in all");
  });

  it("recognises the write freeze refusal", () => {
    expect(isFreezeRefusal("Data writes are frozen (DATA_WRITES_FROZEN): refused.")).toBe(true);
    expect(isFreezeRefusal("Feedback not found.")).toBe(false);
  });
});
