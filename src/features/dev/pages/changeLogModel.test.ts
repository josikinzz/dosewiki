import { describe, expect, it } from "vitest";

import {
  articleNames,
  datePresetFor,
  describeDateFilter,
  describeWindow,
  groupByDay,
  quickDateRange,
  summarizeEntry,
} from "./changeLogModel";

const WINDOW = { loadedCount: 30, hasMore: false, atServerCap: false, loading: false, loadMore: () => {}, error: null, retrying: false, retry: () => {}, archivedIds: new Set<string>() };

describe("changeLogModel", () => {
  it("names a few articles and counts the rest", () => {
    const article = (title: string, id: number) => ({ id, title, slug: title.toLowerCase() });
    expect(articleNames([article("LSD", 1)])).toBe("LSD");
    expect(articleNames([article("LSD", 1), article("MDMA", 2)])).toBe("LSD and MDMA");
    expect(articleNames(["A", "B", "C", "D", "E"].map(article))).toBe("A, B, C and 2 more");
  });

  it("groups saves under local days, newest first, with Today and Yesterday", () => {
    const now = new Date(2026, 0, 15, 12, 0).getTime();
    const at = (day: number, hour: number) => new Date(2026, 0, day, hour).toISOString();
    const days = groupByDay([at(15, 9), at(15, 1), at(14, 20), at(12, 8)], (iso) => iso, now);
    expect(days.map((day) => [day.label, day.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Monday, Jan 12", 1],
    ]);
  });

  it("recognises the quick date ranges and words a custom one", () => {
    const now = new Date(2026, 0, 15, 12, 0);
    const week = quickDateRange(7, now);
    expect(week).toEqual({ startDate: "2026-01-09", endDate: "2026-01-15" });
    expect(datePresetFor(null, null, now)).toBe("any");
    expect(datePresetFor(week.startDate, week.endDate, now)).toBe("7");
    expect(describeDateFilter(week.startDate, week.endDate, now)).toBe("Past 7 days");
    expect(datePresetFor("2026-01-01", "2026-01-03", now)).toBe("custom");
    expect(describeDateFilter("2026-01-01", "2026-01-03", now)).toBe("Jan 1 to Jan 3");
    expect(describeDateFilter("2025-12-30", null, now)).toBe("From Dec 30, 2025");
  });

  it("says how much of the server history is loaded", () => {
    expect(describeWindow({ ...WINDOW, loadedCount: 0, loading: true }, 6).status).toBe("Loading saves");
    expect(describeWindow(WINDOW, 30)).toMatchObject({ status: "30 saves", note: null });
    expect(describeWindow({ ...WINDOW, loadedCount: 100, hasMore: true }, 106).status).toBe("Latest 100 saves");
    expect(describeWindow({ ...WINDOW, loadedCount: 500, atServerCap: true }, 506).note).toMatch(/Only the latest 500/);
  });

  it("keeps the kind of save so a source reads as its title", () => {
    const summary = summarizeEntry({
      id: "s",
      createdAt: "2026-01-01T00:00:00.000Z",
      commit: { sha: "", url: "", message: "Added a source \u2014 Nichols 2016" },
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
      markdown: "+ a source",
      submittedBy: null,
    });
    expect(summary).toMatchObject({ kind: "source", headline: "Added a source", detail: "Nichols 2016", linesAdded: 1, linesRemoved: 0 });
  });
});
