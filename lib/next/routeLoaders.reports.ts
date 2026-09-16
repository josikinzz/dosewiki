import "server-only";

import { cache } from "react";
import {
  getPublicReportBySlug,
  getPublicSubstanceLookup,
  type TripReportDetailRecord,
} from "@server/data/publicData";
import { getLocalizedPublicReportBySlug } from "@server/translation/localizedRecords";
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
import { getReportBrowsePage } from "./reportBrowse";
import type { ReportBrowsePage } from "../../src/features/reports/domain/reportBrowsePage";
import type { ReportViewMode } from "../../src/types/tripReport";

export type ReportsIndexRouteResult = OkRouteResult<
  ReportsIndexViewModel["pageProps"] & { browsingPage: ReportBrowsePage; emptyState?: PublicRouteEmptyState }
>;

export const loadReportsIndexRoute = cache(async (locale: LiveLocale | null = null, view: ReportViewMode = "substance"): Promise<ReportsIndexRouteResult> => {
  const browsingPage = await getReportBrowsePage({ view }, locale?.code ?? null);
  const reports = browsingPage.groups.flatMap((group) => group.reports);
  const viewModel = buildReportsIndexViewModel({
    reportCount: browsingPage.total,
    reports,
  });

  return {
    kind: "ok",
    pageProps: {
      ...viewModel.pageProps,
      browsingPage,
      emptyState: browsingPage.total === 0 ? reportsIndexEmptyState : undefined,
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
    getPublicSubstanceLookup(),
  ]);

  if (!report) {
    return { kind: "not-found" };
  }

  return {
    kind: "ok",
    pageProps: { report },
    substanceBySlug: Object.fromEntries(
      substances.map((substance) => [substance.slug, { name: substance.name }]),
    ),
    metadata: {
      title: report.title,
      description: buildMetadataDescription(report.introduction ?? REPORT_FALLBACK_METADATA.description),
    },
    canonicalRoute: { family: "report", params: { slug } },
  };
});
