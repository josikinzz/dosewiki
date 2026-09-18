import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { publicReadIndexReady } from "./publicReadIndexes";

/**
 * Denormalized substance-name lookup for `tripReports`.
 *
 * The report-name join index avoids scanning the whole `tripReports` table
 * on every article render to find reports that mention a substance.
 * `tripReportSubstances` holds one row per distinct
 * (report, lowercase substance name) pair with an index on the name, which
 * turns that scan into a handful of point reads.
 *
 * The key is `name.toLowerCase()` and nothing else: the read path it replaces
 * compared `s.name.toLowerCase() === query.toLowerCase()`, and a stricter
 * normalization (trimming, diacritics) would change which reports match.
 *
 * The central indexed mutation boundary maintains every source write. Until
 * a complete durable backfill pass is certified, readers keep full results
 * through the temporary legacy scan, even when some join rows already exist.
 */

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


/**
 * Reports whose `substances` contain any of `substanceNames`, case-insensitive,
 * in `_creationTime` order, which is the order the legacy full scan returned.
 *
 * Falls back only while the durable completion marker is absent. Every hit
 * is re-checked against the report, so stale or orphaned legacy join rows
 * cannot surface a report that no longer mentions the substance.
 */
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
