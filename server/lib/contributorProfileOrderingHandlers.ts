import { PostgresError } from "../../lib/postgres/runtime/values"
import { replicationRevision } from "./replicationEditJournal";
import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import {
  canEditContributorProfile,
  normalizeOrderSlugs,
  normalizeProfileKey,
  pruneOrderSlugs,
  type StoredProfile,
} from "./contributorProfiles";
import {
  contributorProfileRevalidationKeys,
  getStoredContributorProfile,
} from "./contributorProfilePersistence";

async function existingSlugsIn(
  ctx: MutationCtx,
  table: "replications" | "tripReports",
  requested: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const slug of requested) {
    const row = await ctx.db
      .query(table)
      .withIndex("by_slug", (query) => query.eq("slug", slug))
      .first();
    if (row) found.add(slug);
  }
  return found;
}

export async function setContributorOrderingHandler(
  ctx: MutationCtx,
  args: {
    apiKey?: string;
    actorEmail?: string;
    key: string;
    replicationOrder?: string[];
    expectedReplicationOrder?: string[];
    expectedRevision?: string;
    reportOrder?: string[];
  },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "editor",
  );
  const key = normalizeProfileKey(args.key);
  if (!key) throw new Error("Profile key is required.");
  const existing = await getStoredContributorProfile(ctx, key);
  if (!existing) throw new Error(`Profile "${key}" not found.`);
  if (
    !canEditContributorProfile({
      actorEmail: actor.email,
      actorRole: actor.role,
      targetKey: key,
      existingProfile: existing as StoredProfile,
    })
  ) {
    throw new Error("You can only edit your own contributor profile.");
  }
  if (args.replicationOrder !== undefined && await replicationRevision(ctx, existing, `artist:${key}`) !== args.expectedRevision) throw new PostgresError({ code: "CONFLICT", message: "This collection changed. Reload its stored order before saving." });
  if (
    args.expectedReplicationOrder !== undefined &&
    JSON.stringify(normalizeOrderSlugs(existing.replicationOrder)) !==
      JSON.stringify(normalizeOrderSlugs(args.expectedReplicationOrder))
  ) {
    return {
      status: "conflict" as const,
      server: normalizeOrderSlugs(existing.replicationOrder),
    };
  }

  const patch: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    updatedBy: actor.email,
  };
  let prunedReplicationSlugs: string[] = [];
  let prunedReportSlugs: string[] = [];

  if (args.replicationOrder !== undefined) {
    const requested = normalizeOrderSlugs(args.replicationOrder);
    const known = await existingSlugsIn(ctx, "replications", requested);
    const result = pruneOrderSlugs(requested, known);
    patch.replicationOrder = result.order;
    prunedReplicationSlugs = result.pruned;
  }
  if (args.reportOrder !== undefined) {
    const requested = normalizeOrderSlugs(args.reportOrder);
    const known = await existingSlugsIn(ctx, "tripReports", requested);
    const result = pruneOrderSlugs(requested, known);
    patch.reportOrder = result.order;
    prunedReportSlugs = result.pruned;
  }

  await ctx.db.patch(existing._id, patch);
  const updated = (await getStoredContributorProfile(ctx, key)) as StoredProfile | null;
  return {
    status: "ok" as const,
    key,
    replicationOrder: normalizeOrderSlugs(updated?.replicationOrder),
    reportOrder: normalizeOrderSlugs(updated?.reportOrder),
    prunedReplicationSlugs,
    prunedReportSlugs,
    revalidate: {
      contributorKeys: contributorProfileRevalidationKeys(key, updated?.aliases),
      reportSlugs: [] as string[],
    },
  };
}
