import "server-only";

import {
  getPublicCategoryLayout,
  getPublicDataOverview,
  getPublicReportBySlug,
  getPublicReports,
  getPublicSubstanceBySlug,
  getPublicSubstanceLookup,
  getPublicSubstances,
  type PublicCategoryLayout,
  type PublicReportPreview,
  type PublicSubstanceLookupEntry,
  type TripReportDetailRecord,
} from "@server/convex/publicData";
import {
  getPublicCategoryDetail,
} from "@server/convex/publicLibrary";
import { getEffectsByCategory, getPublicEffects } from "@server/convex/publicData";
import { getEffectCategoryDefinition } from "../../src/data/effectCategoryDefinitions";
import {
  buildEffectsIndexViewModel,
  buildReportsIndexViewModel,
  buildSubstanceArticleViewModel,
  type EffectsIndexViewModel,
  type ReportsIndexViewModel,
  type SubstanceArticleViewModel,
} from "./publicRouteViewModels";
import type { CategoryDetail } from "../../src/data/builders/library";
import type { PublicEffectPreview } from "../convex/publicData.shared";

export type PublicRouteEmptyState = {
  badge: string;
  title: string;
  description: string;
  icon: "lucide:search" | "lucide:search-x" | "lucide:file-search";
  footer?: string;
};

export type SubstanceRouteOutcome =
  | { route: "substance"; state: "found"; slug: string; viewModel: SubstanceArticleViewModel }
  | { route: "substance"; state: "not-found"; slug: string };

export type SubstancesLayoutRouteOutcome =
  | {
      route: "substances";
      state: "found";
      layout: PublicCategoryLayout;
      substances: PublicSubstanceLookupEntry[];
    }
  | { route: "substances"; state: "unavailable"; reason: "category-layout-unavailable" };

export type CategoryRouteOutcome =
  | { route: "category"; state: "found"; categoryKey: string; detail: CategoryDetail }
  | { route: "category"; state: "not-found"; categoryKey: string };

export type EffectCategoryRouteOutcome =
  | {
      route: "effects-category";
      state: "found";
      categorySlug: string;
      effects: PublicEffectPreview[];
    }
  | { route: "effects-category"; state: "not-found"; categorySlug: string };

export type ReportRouteOutcome =
  | {
      route: "report";
      state: "found";
      slug: string;
      report: TripReportDetailRecord;
      substances: Awaited<ReturnType<typeof getPublicSubstances>>;
    }
  | { route: "report"; state: "not-found"; slug: string };

export type EffectsIndexRouteOutcome =
  | { route: "effects"; state: "found"; viewModel: EffectsIndexViewModel }
  | { route: "effects"; state: "empty"; viewModel: EffectsIndexViewModel; emptyState: PublicRouteEmptyState };

export type ReportsIndexRouteOutcome =
  | { route: "reports"; state: "found"; viewModel: ReportsIndexViewModel }
  | { route: "reports"; state: "empty"; viewModel: ReportsIndexViewModel; emptyState: PublicRouteEmptyState };

export const effectsIndexEmptyState: PublicRouteEmptyState = {
  badge: "No effects",
  title: "No effects found",
  description: "No subjective effects have been imported yet. Run the migration flow to populate this index.",
  icon: "lucide:search-x",
};

export const reportsIndexEmptyState: PublicRouteEmptyState = {
  badge: "No reports yet",
  title: "No trip reports found",
  description:
    "There aren't any public reports in this deployment yet. Once reports are available, they'll appear here grouped by substance, title, or author.",
  icon: "lucide:file-search",
};

export async function getSubstanceRouteOutcome(slug: string): Promise<SubstanceRouteOutcome> {
  const substance = await getPublicSubstanceBySlug(slug);

  if (!substance) {
    return { route: "substance", state: "not-found", slug };
  }

  return {
    route: "substance",
    state: "found",
    slug,
    viewModel: buildSubstanceArticleViewModel({ slug, substance }),
  };
}

export async function getSubstancesLayoutRouteOutcome(): Promise<SubstancesLayoutRouteOutcome> {
  const [layout, substances] = await Promise.all([getPublicCategoryLayout(), getPublicSubstanceLookup()]);

  if (!layout) {
    return {
      route: "substances",
      state: "unavailable",
      reason: "category-layout-unavailable",
    };
  }

  return { route: "substances", state: "found", layout, substances };
}

export async function getCategoryRouteOutcome(categoryKey: string): Promise<CategoryRouteOutcome> {
  const detail = await getPublicCategoryDetail(categoryKey);

  if (!detail) {
    return { route: "category", state: "not-found", categoryKey };
  }

  return { route: "category", state: "found", categoryKey, detail };
}

export async function getEffectCategoryRouteOutcome(categorySlug: string): Promise<EffectCategoryRouteOutcome> {
  const definition = getEffectCategoryDefinition(categorySlug);

  if (!definition) {
    return { route: "effects-category", state: "not-found", categorySlug };
  }

  const effects = await getEffectsByCategory(categorySlug);

  return { route: "effects-category", state: "found", categorySlug, effects };
}

export async function getReportRouteOutcome(slug: string): Promise<ReportRouteOutcome> {
  const [report, substances] = await Promise.all([getPublicReportBySlug(slug), getPublicSubstances()]);

  if (!report) {
    return { route: "report", state: "not-found", slug };
  }

  return { route: "report", state: "found", slug, report, substances };
}

export async function getEffectsIndexRouteOutcome(): Promise<EffectsIndexRouteOutcome> {
  const [overview, effects] = await Promise.all([getPublicDataOverview(), getPublicEffects()]);
  const viewModel = buildEffectsIndexViewModel({
    effectCount: overview.effectCount,
    effects,
  });

  if (effects.length === 0) {
    return { route: "effects", state: "empty", viewModel, emptyState: effectsIndexEmptyState };
  }

  return { route: "effects", state: "found", viewModel };
}

export async function getReportsIndexRouteOutcome(): Promise<ReportsIndexRouteOutcome> {
  const [overview, reports] = await Promise.all([getPublicDataOverview(), getPublicReports()]);
  const viewModel = buildReportsIndexViewModel({
    reportCount: overview.reportCount,
    reports: reports as PublicReportPreview[],
  });

  if (reports.length === 0) {
    return { route: "reports", state: "empty", viewModel, emptyState: reportsIndexEmptyState };
  }

  return { route: "reports", state: "found", viewModel };
}
