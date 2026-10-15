import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { publicReadIndexReady } from "./publicReadIndexes";

export function tripReportSubstanceKey(name: string): string {
  return name.toLowerCase();
}

export function tripReportSubstanceKeys(
  substances: ReadonlyArray<{ name: string }>,
): string[] {
  const keys = new Set<string>();
  for (const substance of substances) {
    keys.add(tripReportSubstanceKey(substance.name));
  }
  return [...keys];
}

export type TripReportSubstanceSyncResult = { inserted: number; removed: number };

export async function syncTripReportSubstanceRows(
  ctx: MutationCtx,
  reportId: Id<"tripReports">,
  substances: ReadonlyArray<{ name: string }>,
): Promise<TripReportSubstanceSyncResult> {
  const wanted = new Set(tripReportSubstanceKeys(substances));
  const existing = await ctx.db
    .query("tripReportSubstances")
    .withIndex("by_report", (q) => q.eq("report_id", reportId))
    .collect();

  let removed = 0;
  const kept = new Set<string>();
  for (const row of existing) {
    if (wanted.has(row.name_lower) && !kept.has(row.name_lower)) {
      kept.add(row.name_lower);
      continue;
    }
    await ctx.db.delete(row._id);
    removed += 1;
  }

  let inserted = 0;
  for (const name_lower of wanted) {
    if (kept.has(name_lower)) continue;
    await ctx.db.insert("tripReportSubstances", { report_id: reportId, name_lower });
    inserted += 1;
  }

  return { inserted, removed };
}

export async function deleteTripReportSubstanceRows(
  ctx: MutationCtx,
  reportId: Id<"tripReports">,
): Promise<number> {
  const existing = await ctx.db
    .query("tripReportSubstances")
    .withIndex("by_report", (q) => q.eq("report_id", reportId))
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  return existing.length;
}

export async function findTripReportsBySubstanceNames(
  ctx: QueryCtx,
  substanceNames: ReadonlyArray<string>,
): Promise<Doc<"tripReports">[]> {
  if (substanceNames.length === 0) return [];
  const lowerNames = new Set(substanceNames.map(tripReportSubstanceKey));
  const matches = (report: Doc<"tripReports">) =>
    report.substances.some((s) => lowerNames.has(tripReportSubstanceKey(s.name)));

  if (!(await publicReadIndexReady(ctx, "tripReports"))) {
    const allReports = await ctx.db.query("tripReports").collect();
    return allReports.filter(matches);
  }

  const reports = new Map<string, Doc<"tripReports">>();
  for (const name_lower of lowerNames) {
    const rows = await ctx.db
      .query("tripReportSubstances")
      .withIndex("by_name_lower", (q) => q.eq("name_lower", name_lower))
      .collect();
    for (const row of rows) {
      const key = row.report_id as string;
      if (reports.has(key)) continue;
      const report = await ctx.db.get(row.report_id);
      if (report && matches(report)) {
        reports.set(key, report);
      }
    }
  }

  return [...reports.values()].sort((a, b) => a._creationTime - b._creationTime);
}
