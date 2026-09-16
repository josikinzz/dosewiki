import type { QueryCtx } from "../../lib/postgres/runtime/server";
import type { Doc } from "../../lib/postgres/runtime/dataModel";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig } from "../../src/data/builders/manualIndexLoader";
import type { LibraryArticleInput } from "../../src/data/builders/articleNormalization";

export type PublicOverviewCounts = {
  substanceCount: number;
  effectCount: number;
  reportCount: number;
  replicationCount: number;
  aboutConfigured: boolean;
  psychoactiveCategoryCount: number;
};

type CountReader = {
  getPublicOverviewCounts: () => Promise<PublicOverviewCounts>;
  getAboutAggregateSubstanceRows: () => Promise<Doc<"substanceIndex">[]>;
};

export async function getPublicOverviewCountsHandler(ctx: QueryCtx): Promise<PublicOverviewCounts> {
  return (ctx.db as typeof ctx.db & CountReader).getPublicOverviewCounts();
}

/**
 * Exact About placeholder values from the same normalization and manual-index
 * projection as buildLibrary. The SQL projection carries taxonomy only: prose,
 * dosage, interactions, references, and renditions never cross the wire.
 */
export async function getAboutEditorAggregates(ctx: QueryCtx) {
  const reader = ctx.db as typeof ctx.db & CountReader;
  const [rows, layouts, overview] = await Promise.all([
    reader.getAboutAggregateSubstanceRows(),
    ctx.db.query("indexLayouts").collect(),
    reader.getPublicOverviewCounts(),
  ]);
  const byType = new Map(layouts.map((layout) => [layout.type, layout]));
  const empty = { version: 1, categories: [] };
  const library = buildLibrary(rows as unknown as LibraryArticleInput[], {
    psychoactive: parseManualConfig(byType.get("psychoactive") ?? empty),
    chemical: parseManualConfig(byType.get("chemical") ?? empty),
    mechanism: parseManualConfig(byType.get("mechanism") ?? empty),
  });
  const psychoactiveClassCount = library.dosageCategoryGroups.length;
  const mechanismClassCount = library.mechanismIndexGroups.length;
  return {
    compoundCount: library.substanceRecords.length,
    psychoactiveClassCount,
    categoryCount: psychoactiveClassCount,
    chemicalClassCount: library.chemicalClassIndexGroups.length,
    mechanismClassCount,
    mechanismOfActionClassCount: mechanismClassCount,
    reportCount: overview.reportCount,
    replicationCount: overview.replicationCount,
  };
}
