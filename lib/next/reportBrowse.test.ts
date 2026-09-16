import { describe, expect, it, vi } from "vitest";
import type { ReportCardModel } from "../../src/types/tripReport";
import { projectReportBrowsePage, REPORT_BROWSE_PAGE_SIZE } from "./reportBrowse";

vi.mock("server-only", () => ({}));
vi.mock("@server/data/publicData", () => ({}));
vi.mock("@server/translation/localizedRecords", () => ({}));

const reports: ReportCardModel[] = Array.from({ length: 61 }, (_, index) => ({
  slug: `report-${index}`, title: index % 2 ? "Same title" : `Report ${index}`,
  featured: false, subject: { name: `Author ${index % 4}` },
  substances: index % 7 === 0 ? [] : [{ name: index % 3 ? "DMT" : "LSD" }],
}));

describe("bounded report browsing", () => {
  it("traverses each grouping without losing or duplicating equal-sort identities", () => {
    for (const view of ["substance", "author", "title"] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = projectReportBrowsePage(reports, { view, cursor });
        const slugs = page.groups.flatMap((group) => group.reports.map((report) => report.slug));
        expect(slugs.length).toBeLessThanOrEqual(REPORT_BROWSE_PAGE_SIZE);
        seen.push(...slugs);
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen.length).toBe(reports.length);
      expect([...new Set(seen)].sort()).toEqual(reports.map((report) => report.slug).sort());
    }
  });

  it("rejects a cursor when locale, filters, membership or ordering change", () => {
    const cursor = projectReportBrowsePage(reports, { view: "title" }, "en").nextCursor;
    expect(cursor).not.toBeNull();
    expect(() => projectReportBrowsePage(reports, { view: "title", cursor }, "zh-Hans")).toThrow(/cursor/i);
    expect(() => projectReportBrowsePage(reports, { view: "title", cursor, query: "Same" }, "en")).toThrow(/cursor/i);
    expect(() => projectReportBrowsePage(reports.slice(1), { view: "title", cursor }, "en")).toThrow(/cursor/i);
    const reordered = reports.map((report, index) => index === 0 ? { ...report, title: "ZZZ" } : report);
    expect(() => projectReportBrowsePage(reordered, { view: "title", cursor }, "en")).toThrow(/cursor/i);
  });

  it("keeps corpus facets while filtering reports beyond the first page", () => {
    const page = projectReportBrowsePage(reports, { view: "title", query: "Report 60" });
    expect(page.groups.flatMap((group) => group.reports.map((report) => report.slug))).toEqual(["report-60"]);
    expect(page.total).toBe(61);
    expect(page.filteredTotal).toBe(1);
    expect(page.substanceOptions.map((entry) => entry.name)).toEqual(["DMT", "LSD"]);
  });
});
