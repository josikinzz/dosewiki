import { describe, expect, it } from "vitest";

import type { FeedbackImportance, FeedbackQueueItem } from "./FeedbackReviewQueue";
import { defaultSort, pageLocally, totalFor } from "./feedbackQueueModel";

type Row = FeedbackQueueItem & { importance?: FeedbackImportance; term: string };

function row(id: string, day: number, status: Row["status"], extra: Partial<Row> = {}): Row {
  return { id, status, details: "", term: id, created_at: `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`, ...extra };
}

describe("feedback queue model", () => {
  it("opens unresolved statuses oldest first and history newest first", () => {
    expect(defaultSort("new")).toBe("oldest");
    expect(defaultSort("reviewing")).toBe("oldest");
    expect(defaultSort("resolved")).toBe("newest");
    expect(defaultSort("all")).toBe("newest");
  });

  it("totals one status or all of them", () => {
    const counts = { new: 1, reviewing: 2, resolved: 3, rejected: 4, spam: 5 };
    expect(totalFor(counts, "reviewing")).toBe(2);
    expect(totalFor(counts, "all")).toBe(15);
  });

  it("pages a whole list locally: status, search, order, and an offset cursor", () => {
    const rows = [
      row("old", 1, "new", { importance: "low" }),
      row("mid", 2, "new", { importance: "critical" }),
      row("late", 3, "new", { importance: "high", term: "Ketamine" }),
      row("done", 4, "resolved"),
    ];
    const importance = (item: Row) => item.importance;

    const first = pageLocally(rows, { status: "new", search: "", sort: "oldest", cursor: null }, importance, 2);
    expect(first.rows.map((item) => item.id)).toEqual(["old", "mid"]);
    expect(first.counts).toEqual({ new: 3, reviewing: 0, resolved: 1, rejected: 0, spam: 0 });
    const second = pageLocally(rows, { status: "new", search: "", sort: "oldest", cursor: first.nextCursor }, importance, 2);
    expect(second.rows.map((item) => item.id)).toEqual(["late"]);
    expect(second.nextCursor).toBeNull();

    const ranked = pageLocally(rows, { status: "all", search: "", sort: "importance", cursor: null }, importance);
    expect(ranked.rows.map((item) => item.id)).toEqual(["mid", "late", "old", "done"]);

    const searched = pageLocally(rows, { status: "all", search: "ketamine", sort: "newest", cursor: null }, importance);
    expect(searched.rows.map((item) => item.id)).toEqual(["late"]);
    expect(searched.counts.new).toBe(1);
  });
});
