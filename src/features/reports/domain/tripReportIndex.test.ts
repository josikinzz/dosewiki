import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "@/schema";
import type { ReportCardModel, TripReport } from "@/types/tripReport";
import {
  foldSparseGroups,
  getReportBackTarget,
  getSubstanceSearchNames,
  getSubstanceTripReportGroups,
  getVisibleSubstanceTripReports,
  groupTripReports,
  prepareSubstanceTripReports,
  reportMatchesSubstance,
  selectFeaturedReports,
  selectRecentlyAddedReports,
} from "./tripReportIndex";

const reportCard = ({
  slug,
  title,
  author = "Author",
  substances,
  featured = false,
  tripDate,
  publishedAt,
}: {
  slug: string;
  title: string;
  author?: string;
  substances: string[];
  featured?: boolean;
  tripDate?: string;
  publishedAt?: string;
}): ReportCardModel => ({
  slug,
  title,
  featured,
  subject: { name: author, trip_date: tripDate },
  substances: substances.map((name) => ({ name })),
  publishedAt,
});

const tripReport = (card: ReportCardModel): TripReport => ({
  ...card,
  onset: [],
  peak: [],
  offset: [],
  tags: [],
});

const article = {
  title: "N,N-DMT",
  identification: {
    common_name: "DMT",
    alternative_names: ["Dimethyltryptamine", "Businessman's Trip"],
  },
} as SubstanceArticle;

describe("trip report index domain", () => {
  it("ranks the added band on publication date, whatever the experience date says", () => {
    const reports = [
      reportCard({
        slug: "old-experience-new-here",
        title: "Old experience",
        substances: ["LSD"],
        tripDate: "2013",
        publishedAt: "2026-09-01T00:00:00.000Z",
      }),
      reportCard({
        slug: "new-experience-old-here",
        title: "New experience",
        substances: ["LSD"],
        tripDate: "2025/07/10",
        publishedAt: "2020-01-01T00:00:00.000Z",
      }),
      reportCard({
        slug: "curated",
        title: "Curated",
        substances: ["LSD"],
        featured: true,
        tripDate: "2013",
        publishedAt: "2019-01-01T00:00:00.000Z",
      }),
    ];

    expect(selectRecentlyAddedReports(reports, 3).map((report) => report.slug)).toEqual([
      "old-experience-new-here",
      "new-experience-old-here",
      "curated",
    ]);
  });

  it("falls back to the experience date where no publication date was served", () => {
    const reports = [
      reportCard({ slug: "recent", title: "Recent", substances: ["LSD"], tripDate: "2022/05/04" }),
      reportCard({ slug: "undated", title: "Undated", substances: ["LSD"] }),
      reportCard({ slug: "older", title: "Older", substances: ["LSD"], tripDate: "2013" }),
    ];

    expect(selectRecentlyAddedReports(reports, 3).map((report) => report.slug)).toEqual([
      "recent",
      "older",
      "undated",
    ]);
  });

  it("keeps the featured band to curated reports, newest experience first", () => {
    const reports = [
      reportCard({ slug: "plain", title: "Plain", substances: ["LSD"], tripDate: "2026" }),
      reportCard({ slug: "old-pick", title: "Old pick", substances: ["LSD"], featured: true, tripDate: "2013" }),
      reportCard({ slug: "new-pick", title: "New pick", substances: ["LSD"], featured: true, tripDate: "2019" }),
    ];

    expect(selectFeaturedReports(reports, 5).map((report) => report.slug)).toEqual([
      "new-pick",
      "old-pick",
    ]);
  });

  it("groups reports by title initial, author, and substance with linkable anchors", () => {
    const reports = [
      reportCard({ slug: "combo-z", title: "Zeta Combo", author: "Beta", substances: ["DMT", "Cannabis"] }),
      reportCard({ slug: "lsd-b", title: "Beta LSD", author: "Alpha", substances: ["LSD"] }),
      reportCard({ slug: "dmt-a", title: "Alpha DMT", author: "Beta", substances: ["DMT"] }),
    ];

    expect(groupTripReports(reports, "title", "desc")).toEqual([
      { name: "Z", anchor: "letter-z", kind: "letter", reports: [reports[0]] },
      { name: "B", anchor: "letter-b", kind: "letter", reports: [reports[1]] },
      { name: "A", anchor: "letter-a", kind: "letter", reports: [reports[2]] },
    ]);

    expect(groupTripReports(reports, "author", "asc")).toEqual([
      { name: "Alpha", anchor: "author-alpha", kind: "author", reports: [reports[1]] },
      { name: "Beta", anchor: "author-beta", kind: "author", reports: [reports[2], reports[0]] },
    ]);

    expect(groupTripReports(reports, "substance", "asc")).toEqual([
      { name: "DMT", anchor: "substance-dmt", kind: "substance", reports: [reports[2]] },
      { name: "LSD", anchor: "substance-lsd", kind: "substance", reports: [reports[1]] },
      { name: "Combinations", anchor: "substance-combinations", kind: "mixed", reports: [reports[0]] },
    ]);
  });

  it("pins the combinations shelf last even when a count sort would promote it", () => {
    const reports = [
      reportCard({ slug: "combo-1", title: "Combo One", substances: ["DMT", "LSD"] }),
      reportCard({ slug: "combo-2", title: "Combo Two", substances: ["DMT", "MDMA"] }),
      reportCard({ slug: "solo", title: "Solo", substances: ["Ketamine"] }),
    ];

    expect(
      groupTripReports(reports, "substance", "desc", "count").map((group) => group.name),
    ).toEqual(["Ketamine", "Combinations"]);
  });

  it("orders groups and rows by the newest datable experience", () => {
    const reports = [
      reportCard({ slug: "old", title: "Old", substances: ["LSD"], tripDate: "~2012" }),
      reportCard({ slug: "new", title: "New", substances: ["DMT"], tripDate: "2021/07/02" }),
      reportCard({ slug: "mid", title: "Mid", substances: ["DMT"], tripDate: "09/2018" }),
    ];

    const groups = groupTripReports(reports, "substance", "desc", "date");
    expect(groups.map((group) => group.name)).toEqual(["DMT", "LSD"]);
    expect(groups[0].reports.map((report) => report.slug)).toEqual(["mid", "new"]);
  });

  it("folds one-report substance shelves into a single catch-all", () => {
    const reports = ["Aniracetam", "Bufotenin", "Caffeine", "DXM"].map((substance, index) =>
      reportCard({ slug: `solo-${index}`, title: `Solo ${index}`, substances: [substance] }),
    );

    const folded = foldSparseGroups(groupTripReports(reports, "substance", "asc"));

    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({
      name: "Other substances",
      anchor: "substance-other",
      kind: "mixed",
    });
    expect(folded[0].reports).toHaveLength(4);
  });

  it("leaves a short index unfolded", () => {
    const reports = ["Aniracetam", "Bufotenin"].map((substance, index) =>
      reportCard({ slug: `solo-${index}`, title: `Solo ${index}`, substances: [substance] }),
    );

    expect(foldSparseGroups(groupTripReports(reports, "substance", "asc"))).toHaveLength(2);
  });

  it("sorts substance article reports by featured status and separates combinations", () => {
    const reports = [
      tripReport(reportCard({ slug: "single-b", title: "Beta", substances: ["DMT"] })),
      tripReport(reportCard({ slug: "combo-a", title: "Alpha Combo", substances: ["DMT", "Cannabis"], featured: true })),
      tripReport(reportCard({ slug: "single-a", title: "Alpha", substances: ["DMT"], featured: true })),
      tripReport(reportCard({ slug: "combo-b", title: "Beta Combo", substances: ["DMT", "LSD"] })),
    ];

    const groups = getSubstanceTripReportGroups(reports);
    expect(groups.allReports.map((report) => report.slug)).toEqual(["single-a", "combo-a", "single-b", "combo-b"]);
    expect(groups.singleSubstanceReports.map((report) => report.slug)).toEqual(["single-a", "single-b"]);
    expect(groups.combinationReports.map((report) => report.slug)).toEqual(["combo-a", "combo-b"]);
  });

  it("only collapses substance article reports when enough reports are hidden", () => {
    const reports = Array.from({ length: 5 }, (_, index) =>
      tripReport(reportCard({ slug: `report-${index + 1}`, title: `Report ${index + 1}`, substances: ["DMT"] })),
    );

    const preparedBelowThreshold = prepareSubstanceTripReports(reports, {
      collapsedLimit: 3,
      minHiddenForCollapse: 3,
    });
    const visibleBelowThreshold = getVisibleSubstanceTripReports(preparedBelowThreshold, {
      collapsedLimit: 3,
      isExpanded: false,
    });

    expect(preparedBelowThreshold.hasMore).toBe(false);
    expect(preparedBelowThreshold.totalHidden).toBe(0);
    expect(visibleBelowThreshold.singleSubstanceReports).toHaveLength(5);

    const preparedAtThreshold = prepareSubstanceTripReports(
      [
        ...reports,
        tripReport(reportCard({ slug: "report-6", title: "Report 6", substances: ["DMT"] })),
      ],
      {
        collapsedLimit: 3,
        minHiddenForCollapse: 3,
      },
    );
    const visibleAtThreshold = getVisibleSubstanceTripReports(preparedAtThreshold, {
      collapsedLimit: 3,
      isExpanded: false,
    });

    expect(preparedAtThreshold.hasMore).toBe(true);
    expect(preparedAtThreshold.totalHidden).toBe(3);
    expect(visibleAtThreshold.singleSubstanceReports).toHaveLength(3);
  });

  it("matches related reports by title, common name, alternative names, slug keys, and normalized names", () => {
    expect(getSubstanceSearchNames(article)).toEqual([
      "N,N-DMT",
      "DMT",
      "Dimethyltryptamine",
      "Businessman's Trip",
    ]);

    expect(reportMatchesSubstance(tripReport(reportCard({ slug: "title", title: "Title", substances: ["N,N-DMT"] })), article)).toBe(true);
    expect(reportMatchesSubstance(tripReport(reportCard({ slug: "common", title: "Common", substances: ["dmt"] })), article)).toBe(true);
    expect(reportMatchesSubstance(tripReport(reportCard({ slug: "alt", title: "Alt", substances: ["Dimethyltryptamine"] })), article)).toBe(true);
    expect(reportMatchesSubstance(tripReport(reportCard({ slug: "slug", title: "Slug", substances: ["Businessman's Trip"] })), article)).toBe(true);
    expect(reportMatchesSubstance(tripReport(reportCard({ slug: "other", title: "Other", substances: ["LSD"] })), article)).toBe(false);
  });

  it("prepares collapsed substance report visibility with single-substance reports first", () => {
    const reports = [
      tripReport(reportCard({ slug: "single-a", title: "Alpha", substances: ["DMT"] })),
      tripReport(reportCard({ slug: "combo-a", title: "Alpha Combo", substances: ["DMT", "Cannabis"] })),
      tripReport(reportCard({ slug: "single-b", title: "Beta", substances: ["DMT"] })),
      tripReport(reportCard({ slug: "combo-b", title: "Beta Combo", substances: ["DMT", "LSD"] })),
    ];

    const prepared = prepareSubstanceTripReports(reports, { article, collapsedLimit: 3 });
    const visible = getVisibleSubstanceTripReports(prepared, { collapsedLimit: 3, isExpanded: false });

    expect(prepared.hasMore).toBe(true);
    expect(prepared.totalHidden).toBe(1);
    expect(visible.singleSubstanceReports.map((report) => report.slug)).toEqual(["single-a", "single-b"]);
    expect(visible.combinationReports.map((report) => report.slug)).toEqual(["combo-a"]);
  });

  it("derives detail back targets from from state, report substance slug matches, exact names, and fallback", () => {
    const substanceBySlug = {
      dmt: { name: "DMT" },
      lsd: { name: "LSD" },
      "n-n-dmt": { name: "N,N-DMT" },
    };

    expect(
      getReportBackTarget({
        report: tripReport(reportCard({ slug: "dmt", title: "DMT", substances: ["DMT"] })),
        substanceBySlug,
        fromSubstanceSlug: "lsd",
      }),
    ).toEqual({ href: "/lsd", label: "Back to LSD" });

    expect(
      getReportBackTarget({
        report: tripReport(reportCard({ slug: "dmt", title: "DMT", substances: ["N,N-DMT"] })),
        substanceBySlug,
        fromSubstanceSlug: "unknown",
      }),
    ).toEqual({ href: "/unknown", label: "Back to N,N-DMT" });

    expect(
      getReportBackTarget({
        report: tripReport(reportCard({ slug: "fallback", title: "Fallback", substances: ["Unknown"] })),
        substanceBySlug,
      }),
    ).toEqual({ href: "/reports", label: "Back to Reports" });
  });
});
