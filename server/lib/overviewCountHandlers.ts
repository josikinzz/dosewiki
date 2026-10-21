import type { QueryCtx } from "../../lib/postgres/runtime/server";
import type { PublicOverviewCounts } from "../../lib/postgres/runtime/projectionReads";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig } from "../../src/data/builders/manualIndexLoader";
import type { LibraryArticleInput } from "../../src/data/builders/articleNormalization";

export async function getPublicOverviewCountsHandler(ctx: QueryCtx): Promise<PublicOverviewCounts> {
  return ctx.db.getPublicOverviewCounts();
}

export async function getAboutEditorAggregates(ctx: QueryCtx) {
  const [rows, layouts, overview] = await Promise.all([
    ctx.db.getAboutAggregateSubstanceRows(),
    ctx.db.query("indexLayouts").collect(),
    ctx.db.getPublicOverviewCounts(),
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
