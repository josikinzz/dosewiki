import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toReportCardModel, type PublicReportPreview, type ReportCardModel } from "../../src/types/tripReport";
import { groupTripReports } from "../../src/features/reports/domain/tripReportIndex";
import { getReportBrowsePage, projectReportBrowsePage, REPORT_BROWSE_PAGE_SIZE } from "./reportBrowse";
import type * as PublicDataCache from "@server/data/publicData.cache";
import type * as TripReport from "../../src/types/tripReport";
import type * as TripReportIndex from "../../src/features/reports/domain/tripReportIndex";

const cacheMocks = vi.hoisted(() => ({
  sourceRevision: vi.fn<() => Promise<string>>(),
  getPublicReports: vi.fn<() => Promise<PublicReportPreview[]>>(),
  getLocalizedLeaves: vi.fn<(values: readonly string[], locale: string) => Promise<Map<string, string>>>(),
  getLocalizedLeavesRevision: vi.fn<(locale: string, hashes: readonly string[]) => Promise<string>>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@server/data/publicData", () => ({ getPublicReports: cacheMocks.getPublicReports }));
vi.mock("@server/data/publicData.cache", async (importOriginal) => ({
  ...await importOriginal<typeof PublicDataCache>(),
  publicDataCache: () => cacheMocks.sourceRevision,
}));
vi.mock("@server/translation/localizedRecords", () => ({
  getLocalizedLeaves: cacheMocks.getLocalizedLeaves,
  getLocalizedLeavesRevision: cacheMocks.getLocalizedLeavesRevision,
}));
vi.mock("../../src/types/tripReport", async (importOriginal) => {
  const actual = await importOriginal<typeof TripReport>();
  return { ...actual, toReportCardModel: vi.fn(actual.toReportCardModel) };
});
vi.mock("../../src/features/reports/domain/tripReportIndex", async (importOriginal) => {
  const actual = await importOriginal<typeof TripReportIndex>();
  return { ...actual, groupTripReports: vi.fn(actual.groupTripReports) };
});

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

describe("publication-aware report browsing", () => {
  let generation = 0;
  let source: PublicReportPreview[];

  beforeEach(() => {
    vi.clearAllMocks();
    source = reports.map((report, index) => ({
      slug: report.slug, title: report.title, author: report.subject.name,
      featured: index % 5 === 0, substances: report.substances,
      substanceNames: report.substances.map(({ name }) => name), introduction: "",
      authorProfileKey: `profile-${index % 4}`, authorAvatarUrl: `https://example.test/avatar-${index % 4}.png`,
      tripDate: `2025-01-${String(index % 28 + 1).padStart(2, "0")}`,
      publishedAt: `2026-01-${String(index % 28 + 1).padStart(2, "0")}`,
    }));
    cacheMocks.sourceRevision.mockReset().mockResolvedValue(`source-${++generation}`);
    cacheMocks.getPublicReports.mockReset().mockResolvedValue(source);
    cacheMocks.getLocalizedLeaves.mockReset().mockResolvedValue(new Map());
    cacheMocks.getLocalizedLeavesRevision.mockReset().mockResolvedValue("translation-1");
  });

  it("shares a canonical build and normalized membership across concurrent pages and continuations", async () => {
    const [first, concurrent] = await Promise.all([
      getReportBrowsePage({ view: "title", query: " REPORT " }),
      getReportBrowsePage({ view: "title", query: "report", sortId: "unknown", substance: " " }),
    ]);
    expect(concurrent).toEqual(first);
    const next = await getReportBrowsePage({ view: "title", query: "report", cursor: first.nextCursor });
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(1);
    expect(toReportCardModel).toHaveBeenCalledTimes(source.length);
    expect(groupTripReports).toHaveBeenCalledTimes(1);
    const cards = source.map(toReportCardModel);
    expect(first).toEqual(projectReportBrowsePage(cards, { view: "title", query: "report" }));
    expect(next).toEqual(projectReportBrowsePage(cards, { view: "title", query: "report", cursor: first.nextCursor }));
  });

  it("retains whole-corpus facets and highlights while filtering past the first page", async () => {
    const full = await getReportBrowsePage({ view: "title" });
    const filtered = await getReportBrowsePage({ view: "title", query: "Report 60" });
    expect(filtered.groups.flatMap((group) => group.reports.map(({ slug }) => slug))).toEqual(["report-60"]);
    expect(filtered.total).toBe(61);
    expect(filtered.filteredTotal).toBe(1);
    expect(filtered.authorCount).toBe(4);
    expect(filtered.substanceOptions).toEqual(full.substanceOptions);
    expect(filtered.featured).toEqual(full.featured);
    expect(filtered.recentlyAdded).toEqual(full.recentlyAdded);
    expect(filtered.featured).toEqual(projectReportBrowsePage(source.map(toReportCardModel), { view: "title" }).featured);
  });

  it("refreshes projected attribution on source publication without changing an equivalent membership cursor", async () => {
    const first = await getReportBrowsePage({ view: "title" });
    const expectedNext = await getReportBrowsePage({ view: "title", cursor: first.nextCursor });
    cacheMocks.sourceRevision.mockResolvedValue("attribution-publication");
    cacheMocks.getPublicReports.mockResolvedValue(source.map((report) => ({ ...report, authorAvatarUrl: "https://example.test/new.png" })));
    const next = await getReportBrowsePage({ view: "title", cursor: first.nextCursor });
    expect(next.groups.flatMap((group) => group.reports.map(({ slug }) => slug))).toEqual(expectedNext.groups.flatMap((group) => group.reports.map(({ slug }) => slug)));
    expect(next.groups.flatMap((group) => group.reports).every((report) => report.subject.avatar_url === "https://example.test/new.png")).toBe(true);
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(2);
    expect(toReportCardModel).toHaveBeenCalledTimes(source.length * 2);
    expect(groupTripReports).toHaveBeenCalledTimes(2);
    cacheMocks.sourceRevision.mockResolvedValue("membership-publication");
    cacheMocks.getPublicReports.mockResolvedValue(source.slice(1));
    await expect(getReportBrowsePage({ view: "title", cursor: first.nextCursor })).rejects.toThrow("Invalid report cursor");
  });

  it("reuses localized titles until translation replacement or deletion and isolates locales", async () => {
    cacheMocks.getLocalizedLeaves.mockResolvedValue(new Map([["Report 0", "Translated title"]]));
    const first = await getReportBrowsePage({ view: "title" }, "zh-Hans");
    const next = await getReportBrowsePage({ view: "title", cursor: first.nextCursor }, "zh-Hans");
    expect(cacheMocks.getLocalizedLeaves).toHaveBeenCalledTimes(1);
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(1);
    expect(toReportCardModel).toHaveBeenCalledTimes(source.length);
    expect(groupTripReports).toHaveBeenCalledTimes(1);
    const localized = source.map((report) => toReportCardModel({ ...report, title: report.title === "Report 0" ? "Translated title" : report.title }));
    expect(next).toEqual(projectReportBrowsePage(localized, { view: "title", cursor: first.nextCursor }, "zh-Hans"));
    cacheMocks.getLocalizedLeavesRevision.mockResolvedValue("translation-2");
    cacheMocks.getLocalizedLeaves.mockResolvedValue(new Map([["Report 0", "A replacement"]]));
    await expect(getReportBrowsePage({ view: "title", cursor: first.nextCursor }, "zh-Hans")).rejects.toThrow("Invalid report cursor");
    const replaced = await getReportBrowsePage({ view: "title", query: "A replacement" }, "zh-Hans");
    expect(replaced.groups[0].reports[0].title).toBe("A replacement");
    expect(cacheMocks.getLocalizedLeaves).toHaveBeenCalledTimes(2);
    cacheMocks.getLocalizedLeavesRevision.mockResolvedValue("empty");
    cacheMocks.getLocalizedLeaves.mockResolvedValue(new Map());
    const deleted = await getReportBrowsePage({ view: "title", query: "Report 0" }, "zh-Hans");
    expect(deleted.groups[0].reports[0].title).toBe("Report 0");
    cacheMocks.getLocalizedLeaves.mockResolvedValue(new Map([["Report 0", "Different locale"]]));
    const otherLocale = await getReportBrowsePage({ view: "title", query: "Different locale" }, "en");
    expect(otherLocale.groups[0].reports[0].title).toBe("Different locale");
    expect(cacheMocks.getLocalizedLeaves).toHaveBeenCalledTimes(4);
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(1);
  });

  it("keeps the original cursor scope, digest and error messages", async () => {
    const first = await getReportBrowsePage({ view: "title" });
    const ordered = [...source].sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug));
    const digest = createHash("sha256").update(JSON.stringify(ordered.map((report) => [`letter-${report.title[0].toLowerCase()}`, report.slug]))).digest("hex");
    const scope = JSON.stringify([null, "title", "name-asc", null, "", digest]);
    const last = ordered[REPORT_BROWSE_PAGE_SIZE - 1];
    expect(first.nextCursor).toBe(Buffer.from(JSON.stringify([scope, `letter-${last.title[0].toLowerCase()}`, last.slug])).toString("base64url"));
    for (const input of [
      { view: "author" as const }, { view: "title" as const, sortId: "name-desc" },
      { view: "title" as const, substance: "DMT" }, { view: "title" as const, query: "Same" },
    ]) await expect(getReportBrowsePage({ ...input, cursor: first.nextCursor })).rejects.toThrow("Invalid report cursor");
    await expect(getReportBrowsePage({ view: "title", cursor: first.nextCursor }, "en")).rejects.toThrow("Invalid report cursor");
    await expect(getReportBrowsePage({ view: "title", cursor: "not-json" })).rejects.toThrow("Invalid report cursor");
    const missing = Buffer.from(JSON.stringify([scope, "letter-r", "missing-report"])).toString("base64url");
    await expect(getReportBrowsePage({ view: "title", cursor: missing })).rejects.toThrow("Report cursor has expired");
  });

  it("bounds query memberships without rebuilding the corpus", async () => {
    const first = await getReportBrowsePage({ view: "title" });
    for (let index = 0; index < 32; index++) await getReportBrowsePage({ view: "title", query: `Report ${index}` });
    expect(groupTripReports).toHaveBeenCalledTimes(33);
    const next = await getReportBrowsePage({ view: "title", cursor: first.nextCursor });
    expect(groupTripReports).toHaveBeenCalledTimes(34);
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(1);
    expect(next).toEqual(projectReportBrowsePage(source.map(toReportCardModel), { view: "title", cursor: first.nextCursor }));
  });

  it("retries rejected canonical and localized builds", async () => {
    cacheMocks.getPublicReports.mockRejectedValueOnce(new Error("source unavailable"));
    await expect(getReportBrowsePage({ view: "title" })).rejects.toThrow("source unavailable");
    await expect(getReportBrowsePage({ view: "title" })).resolves.toMatchObject({ total: 61 });
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(2);
    cacheMocks.getLocalizedLeaves.mockRejectedValueOnce(new Error("translation unavailable"));
    await expect(getReportBrowsePage({ view: "title" }, "zh-Hans")).rejects.toThrow("translation unavailable");
    await expect(getReportBrowsePage({ view: "title" }, "zh-Hans")).resolves.toMatchObject({ total: 61 });
    expect(cacheMocks.getLocalizedLeaves).toHaveBeenCalledTimes(2);
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(2);
  });

  it("does not let an older rejected canonical promise evict a newer entry", async () => {
    let rejectOld!: (error: Error) => void;
    const promise = new Promise<PublicReportPreview[]>((_, reject) => { rejectOld = reject; });
    cacheMocks.getPublicReports.mockReturnValueOnce(promise);
    const old = getReportBrowsePage({ view: "title" });
    const rejected = expect(old).rejects.toThrow("old source failed");
    await vi.waitFor(() => expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(1));
    cacheMocks.sourceRevision.mockResolvedValue("newer-source");
    const current = await getReportBrowsePage({ view: "title" });
    rejectOld(new Error("old source failed"));
    await rejected;
    await getReportBrowsePage({ view: "title", cursor: current.nextCursor });
    expect(cacheMocks.getPublicReports).toHaveBeenCalledTimes(2);
    expect(groupTripReports).toHaveBeenCalledTimes(1);
  });

  it("does not let an older rejected localized promise evict a newer entry", async () => {
    let rejectOld!: (error: Error) => void;
    const promise = new Promise<Map<string, string>>((_, reject) => { rejectOld = reject; });
    cacheMocks.getLocalizedLeaves.mockReturnValueOnce(promise);
    const old = getReportBrowsePage({ view: "title" }, "zh-Hans");
    const rejected = expect(old).rejects.toThrow("old translation failed");
    await vi.waitFor(() => expect(cacheMocks.getLocalizedLeaves).toHaveBeenCalledTimes(1));
    cacheMocks.getLocalizedLeavesRevision.mockResolvedValue("newer-translation");
    const current = await getReportBrowsePage({ view: "title" }, "zh-Hans");
    rejectOld(new Error("old translation failed"));
    await rejected;
    await getReportBrowsePage({ view: "title", cursor: current.nextCursor }, "zh-Hans");
    expect(cacheMocks.getLocalizedLeaves).toHaveBeenCalledTimes(2);
    expect(groupTripReports).toHaveBeenCalledTimes(1);
  });
});
