import "server-only";

import { cache } from "react";
import {
  getPublicDataOverview,
  getPublicReportBySlug,
  getPublicReports,
  getPublicSubstances,
  type TripReportDetailRecord,
} from "@server/convex/publicData";
import { getLocalizedPublicReportBySlug, getLocalizedPublicReports } from "@server/translation/localizedRecords";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { SITE_FLAVOR_CONFIG } from "../../src/config/siteFlavor";
import { reportsIndexEmptyState, type PublicRouteEmptyState } from "./publicRouteOutcomes";
import { buildMetadataDescription, buildReportsIndexViewModel, type ReportsIndexViewModel } from "./publicRouteViewModels";
import {
  type NotFoundRouteResult,
  type OkRouteResult,
  type RouteMetadataSource,
  toRouteMetadata,
} from "./routeLoaderResults";

export type ReportsIndexRouteResult = OkRouteResult<
  ReportsIndexViewModel["pageProps"] & { emptyState?: PublicRouteEmptyState }
>;

export const loadReportsIndexRoute = cache(async (locale: LiveLocale | null = null): Promise<ReportsIndexRouteResult> => {
  const [overview, reports] = await Promise.all([
    getPublicDataOverview(),
    locale ? getLocalizedPublicReports(locale.code) : getPublicReports(),
  ]);
  const viewModel = buildReportsIndexViewModel({
    reportCount: overview.reportCount,
    reports,
  });

  return {
    kind: "ok",
    pageProps: {
      ...viewModel.pageProps,
      emptyState: reports.length === 0 ? reportsIndexEmptyState : undefined,
    },
    metadata: toRouteMetadata(viewModel.metadata),
    canonicalRoute: { family: "reports" },
  };
});

export const REPORT_FALLBACK_METADATA: RouteMetadataSource = {
  title: "Trip report",
  description: `Browse experience reports from ${SITE_FLAVOR_CONFIG.name} contributors.`,
};

export type ReportRouteResult =
  | (OkRouteResult<{ report: TripReportDetailRecord }> & {
      substanceBySlug: Record<string, { name: string }>;
    })
  | NotFoundRouteResult;

export const loadReportRoute = cache(async (slug: string, locale: LiveLocale | null = null): Promise<ReportRouteResult> => {
  const [report, substances] = await Promise.all([
    locale ? getLocalizedPublicReportBySlug(slug, locale.code) : getPublicReportBySlug(slug),
    getPublicSubstances(),
  ]);

  if (!report) {
    return { kind: "not-found" };
  }

  return {
    kind: "ok",
    pageProps: { report },
    substanceBySlug: Object.fromEntries(
      substances.map((substance) => [substance.slug, { name: substance.title }]),
    ),
    metadata: {
      title: report.title,
      description: buildMetadataDescription(report.introduction ?? REPORT_FALLBACK_METADATA.description),
    },
    canonicalRoute: { family: "report", params: { slug } },
  };
});
