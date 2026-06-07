import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "@/schema";
import type { ReportCardModel, TripReport } from "@/types/tripReport";
import {
  getReportBackTarget,
  getSubstanceSearchNames,
  getSubstanceTripReportGroups,
  getVisibleSubstanceTripReports,
  groupTripReports,
  prepareSubstanceTripReports,
  reportMatchesSubstance,
  toTripReportPreviewModel,
} from "./tripReportIndex";

const reportCard = ({
  slug,
  title,
  author = "Author",
  substances,
  featured = false,
}: {
  slug: string;
  title: string;
  author?: string;
  substances: string[];
  featured?: boolean;
}): ReportCardModel => ({
  slug,
  title,
  featured,
  subject: { name: author },
  substances: substances.map((name) => ({ name })),
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
  it("normalizes public preview records into report card models", () => {
    expect(
      toTripReportPreviewModel({
        title: "DMT Breakthrough",
        slug: "dmt-breakthrough",
        author: "Example Author",
        featured: true,
        substanceNames: ["DMT"],
        introduction: "Excerpt",
        tripDate: "2026-04-01",
        authorAvatarUrl: null,
        authorProfileKey: "AUTHOR",
      }),
    ).toEqual({
      title: "DMT Breakthrough",
      slug: "dmt-breakthrough",
      featured: true,
      subject: {
        name: "Example Author",
        trip_date: "2026-04-01",
        avatar_url: undefined,
        profile_key: "AUTHOR",
      },
      substances: [{ name: "DMT" }],
    });
  });

  it("groups reports by title, author, and substance while preserving existing ordering rules", () => {
    const reports = [
      reportCard({ slug: "combo-z", title: "Zeta Combo", author: "Beta", substances: ["DMT", "Cannabis"] }),
      reportCard({ slug: "lsd-b", title: "Beta LSD", author: "Alpha", substances: ["LSD"] }),
      reportCard({ slug: "dmt-a", title: "Alpha DMT", author: "Beta", substances: ["DMT"] }),
    ];

    expect(groupTripReports(reports, "title", "desc")).toEqual([
      { name: "All Reports", reports: [reports[0], reports[1], reports[2]] },
    ]);

    expect(groupTripReports(reports, "author", "asc")).toEqual([
      { name: "Alpha", reports: [reports[1]] },
      { name: "Beta", reports: [reports[2], reports[0]] },
    ]);

    expect(groupTripReports(reports, "substance", "asc")).toEqual([
      { name: "DMT", reports: [reports[2]] },
      { name: "LSD", reports: [reports[1]] },
      { name: "Combinations", reports: [reports[0]] },
    ]);
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
