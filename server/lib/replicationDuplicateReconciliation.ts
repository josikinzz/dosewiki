import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { requireAdminIntent } from "./auth";
import type {
  DuplicateRollbackUpdate,
  DuplicateSuppressionUpdate,
} from "./replicationDuplicateValidators";

const SHA256 = /^[0-9a-f]{64}$/;
const REDDIT_POST_ID = /^[a-z0-9]+$/;
const MAX_BATCH = 20;
const MAX_SOURCE_REFERENCES = 32;

type ExpectedReplication = DuplicateSuppressionUpdate["expected_keeper"];

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isRedditProfileUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && (parsed.hostname === "reddit.com" || parsed.hostname.endsWith(".reddit.com"))
      && /^\/user\/[^/]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function nullable<T>(value: T | undefined): T | null {
  return value ?? null;
}

export function duplicateReplicationSnapshotMatches(row: Doc<"replications">, expected: ExpectedReplication) {
  return row._id === expected.id
    && row.slug === expected.slug
    && row.artist === expected.artist
    && nullable(row.source_catalog_id) === expected.source_catalog_id
    && nullable(row.source_sha256) === expected.source_sha256
    && nullable(row.publication_state) === expected.publication_state
    && nullable(row.duplicate_of_replication_id) === expected.duplicate_of_replication_id;
}

export function validateDuplicateReconciliation(update: DuplicateSuppressionUpdate) {
  const { expected_keeper: keeper, expected_suppressed: suppressed, reconciliation } = update;
  if (keeper.id === suppressed.id) throw new Error(`${reconciliation.component_id}: keeper equals duplicate.`);
  if (!reconciliation.component_id.trim()) throw new Error("Duplicate component ID is required.");
  if (!SHA256.test(reconciliation.evidence_digest)) {
    throw new Error(`${reconciliation.component_id}: invalid evidence digest.`);
  }
  if (keeper.publication_state === "duplicate-suppressed" || keeper.duplicate_of_replication_id) {
    throw new Error(`${reconciliation.component_id}: keeper is already suppressed.`);
  }
  if (
    reconciliation.reddit_post_ids.length === 0
    || reconciliation.source_references.length === 0
    || reconciliation.source_references.length > MAX_SOURCE_REFERENCES
  ) {
    throw new Error(`${reconciliation.component_id}: invalid Reddit provenance cardinality.`);
  }
  const postIds = new Set(reconciliation.reddit_post_ids);
  if (
    postIds.size !== reconciliation.reddit_post_ids.length
    || [...postIds].some((postId) => !REDDIT_POST_ID.test(postId))
  ) {
    throw new Error(`${reconciliation.component_id}: Reddit post IDs are invalid or repeated.`);
  }
  const referenceIds = new Set<string>();
  for (const reference of reconciliation.source_references) {
    if (
      !postIds.has(reference.post_id)
      || referenceIds.has(reference.reference_id)
      || !isHttpUrl(reference.post_url)
      || (reference.source_url !== undefined && !isHttpUrl(reference.source_url))
      || (
        reference.poster_profile_url !== undefined
        && !isRedditProfileUrl(reference.poster_profile_url)
      )
    ) {
      throw new Error(`${reconciliation.component_id}: invalid or repeated source reference.`);
    }
    referenceIds.add(reference.reference_id);
  }
}

async function requireScopedMaintenance(apiKey: string) {
  const authorization = await requireAdminIntent(apiKey, "replicationMaintenance");
  if (authorization.source !== "scoped") {
    throw new Error("Duplicate reconciliation requires the scoped replicationMaintenance credential.");
  }
}

function reconciliationProjection(row: Doc<"replicationDuplicateReconciliations">) {
  return {
    component_id: row.component_id,
    keeper_replication_id: row.keeper_replication_id,
    suppressed_replication_id: row.suppressed_replication_id,
    evidence_digest: row.evidence_digest,
    classification: row.classification,
    keeper_policy: row.keeper_policy,
    reddit_post_ids: row.reddit_post_ids,
    source_references: row.source_references,
  };
}

function intendedProjection(update: DuplicateSuppressionUpdate) {
  return {
    component_id: update.reconciliation.component_id,
    keeper_replication_id: update.expected_keeper.id,
    suppressed_replication_id: update.expected_suppressed.id,
    evidence_digest: update.reconciliation.evidence_digest,
    classification: update.reconciliation.classification,
    keeper_policy: update.reconciliation.keeper_policy,
    reddit_post_ids: update.reconciliation.reddit_post_ids,
    source_references: update.reconciliation.source_references,
  };
}

export async function applyDuplicateSuppressionBatchHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    operation_id: string;
    dry_run: boolean;
    updates: DuplicateSuppressionUpdate[];
  },
) {
  await requireScopedMaintenance(args.apiKey);
  if (!args.operation_id.trim()) throw new Error("Duplicate reconciliation operation ID is required.");
  if (args.updates.length === 0 || args.updates.length > MAX_BATCH) {
    throw new Error(`Duplicate reconciliation batches must contain 1 to ${MAX_BATCH} updates.`);
  }

  const plannedIds = new Set<string>();
  const plannedComponents = new Set<string>();
  const prepared: Array<{
    update: DuplicateSuppressionUpdate;
    keeper: Doc<"replications">;
    suppressed: Doc<"replications">;
    existing: Doc<"replicationDuplicateReconciliations"> | null;
    unchanged: boolean;
  }> = [];

  for (const update of args.updates) {
    validateDuplicateReconciliation(update);
    const componentId = update.reconciliation.component_id;
    for (const id of [update.expected_keeper.id, update.expected_suppressed.id]) {
      if (plannedIds.has(id)) throw new Error(`${componentId}: a batch row appears in two pairs.`);
      plannedIds.add(id);
    }
    if (plannedComponents.has(componentId)) throw new Error(`Repeated duplicate component ${componentId}.`);
    plannedComponents.add(componentId);

    const keeper = await ctx.db.get(update.expected_keeper.id);
    const suppressed = await ctx.db.get(update.expected_suppressed.id);
    const existing = await ctx.db
      .query("replicationDuplicateReconciliations")
      .withIndex("by_component_id", (query) => query.eq("component_id", componentId))
      .unique();
    const existingForSuppressed = await ctx.db
      .query("replicationDuplicateReconciliations")
      .withIndex("by_suppressed_replication_id", (query) =>
        query.eq("suppressed_replication_id", update.expected_suppressed.id))
      .unique();
    if (existingForSuppressed && existingForSuppressed.component_id !== componentId) {
      throw new Error(`${componentId}: suppressed row already belongs to another component.`);
    }
    if (!keeper || !duplicateReplicationSnapshotMatches(keeper, update.expected_keeper)) {
      throw new Error(`Duplicate keeper CAS precondition failed: ${componentId}.`);
    }
    const exactApplied = Boolean(
      suppressed
      && suppressed.publication_state === "duplicate-suppressed"
      && suppressed.duplicate_of_replication_id === update.expected_keeper.id
      && suppressed.duplicate_evidence_digest === update.reconciliation.evidence_digest,
    );
    if (
      !suppressed
      || (
        !duplicateReplicationSnapshotMatches(suppressed, update.expected_suppressed)
        && !(existing?.state === "active" && exactApplied)
      )
    ) {
      throw new Error(`Duplicate suppression CAS precondition failed: ${componentId}.`);
    }
    if (existing && JSON.stringify(reconciliationProjection(existing)) !== JSON.stringify(intendedProjection(update))) {
      throw new Error(`Duplicate reconciliation evidence drifted: ${componentId}.`);
    }
    const unchanged = existing?.state === "active" && exactApplied;
    if (existing?.state === "active" && !unchanged) {
      throw new Error(`Duplicate publication state drifted: ${componentId}.`);
    }
    prepared.push({ update, keeper, suppressed, existing, unchanged });
  }

  const result = {
    operation_id: args.operation_id.trim(),
    dry_run: args.dry_run,
    suppressed: 0,
    unchanged: 0,
    rows: [] as Array<{
      component_id: string;
      keeper_id: Id<"replications">;
      suppressed_id: Id<"replications">;
      action: "would-suppress" | "suppressed" | "unchanged";
    }>,
  };
  const now = Date.now();
  for (const { update, keeper, suppressed, existing, unchanged } of prepared) {
    const componentId = update.reconciliation.component_id;
    if (unchanged) {
      result.unchanged += 1;
      result.rows.push({
        component_id: componentId,
        keeper_id: keeper._id,
        suppressed_id: suppressed._id,
        action: "unchanged",
      });
      continue;
    }
    result.suppressed += 1;
    if (!args.dry_run) {
      await ctx.db.patch(suppressed._id, {
        publication_state: "duplicate-suppressed",
        duplicate_of_replication_id: keeper._id,
        duplicate_evidence_digest: update.reconciliation.evidence_digest,
        duplicate_operation_id: result.operation_id,
        duplicate_suppressed_at: now,
      });
      const record = {
        ...intendedProjection(update),
        state: "active" as const,
        operation_id: result.operation_id,
        rollback_operation_id: undefined,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      if (existing) await ctx.db.patch(existing._id, record);
      else await ctx.db.insert("replicationDuplicateReconciliations", record);
    }
    result.rows.push({
      component_id: componentId,
      keeper_id: keeper._id,
      suppressed_id: suppressed._id,
      action: args.dry_run ? "would-suppress" : "suppressed",
    });
  }
  return result;
}

export async function rollbackDuplicateSuppressionBatchHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    operation_id: string;
    dry_run: boolean;
    updates: DuplicateRollbackUpdate[];
  },
) {
  await requireScopedMaintenance(args.apiKey);
  if (!args.operation_id.trim()) throw new Error("Duplicate rollback operation ID is required.");
  if (args.updates.length === 0 || args.updates.length > MAX_BATCH) {
    throw new Error(`Duplicate rollback batches must contain 1 to ${MAX_BATCH} updates.`);
  }

  const prepared: Array<{
    update: DuplicateRollbackUpdate;
    suppressed: Doc<"replications">;
    record: Doc<"replicationDuplicateReconciliations">;
    unchanged: boolean;
  }> = [];
  const planned = new Set<string>();
  for (const update of args.updates) {
    if (planned.has(update.component_id)) throw new Error(`Repeated duplicate component ${update.component_id}.`);
    planned.add(update.component_id);
    if (!SHA256.test(update.evidence_digest)) throw new Error(`${update.component_id}: invalid evidence digest.`);
    const record = await ctx.db
      .query("replicationDuplicateReconciliations")
      .withIndex("by_component_id", (query) => query.eq("component_id", update.component_id))
      .unique();
    const suppressed = await ctx.db.get(update.suppressed_id);
    if (
      !record
      || !suppressed
      || record.keeper_replication_id !== update.keeper_id
      || record.suppressed_replication_id !== update.suppressed_id
      || record.evidence_digest !== update.evidence_digest
    ) {
      throw new Error(`Duplicate rollback precondition failed: ${update.component_id}.`);
    }
    const unchanged = record.state === "rolled-back"
      && suppressed.publication_state !== "duplicate-suppressed"
      && !suppressed.duplicate_of_replication_id;
    if (record.state === "rolled-back" && !unchanged) {
      throw new Error(`Duplicate rollback state drifted: ${update.component_id}.`);
    }
    if (
      !unchanged
      && (
        suppressed.publication_state !== "duplicate-suppressed"
        || suppressed.duplicate_of_replication_id !== update.keeper_id
        || suppressed.duplicate_evidence_digest !== update.evidence_digest
      )
    ) {
      throw new Error(`Duplicate rollback row drifted: ${update.component_id}.`);
    }
    prepared.push({ update, suppressed, record, unchanged });
  }

  const result = {
    operation_id: args.operation_id.trim(),
    dry_run: args.dry_run,
    restored: 0,
    unchanged: 0,
    rows: [] as Array<{
      component_id: string;
      suppressed_id: Id<"replications">;
      action: "would-restore" | "restored" | "unchanged";
    }>,
  };
  const now = Date.now();
  for (const { update, suppressed, record, unchanged } of prepared) {
    if (unchanged) {
      result.unchanged += 1;
      result.rows.push({
        component_id: update.component_id,
        suppressed_id: suppressed._id,
        action: "unchanged",
      });
      continue;
    }
    result.restored += 1;
    if (!args.dry_run) {
      await ctx.db.patch(suppressed._id, {
        publication_state: undefined,
        duplicate_of_replication_id: undefined,
        duplicate_evidence_digest: undefined,
        duplicate_operation_id: undefined,
        duplicate_suppressed_at: undefined,
      });
      await ctx.db.patch(record._id, {
        state: "rolled-back",
        rollback_operation_id: result.operation_id,
        updated_at: now,
      });
    }
    result.rows.push({
      component_id: update.component_id,
      suppressed_id: suppressed._id,
      action: args.dry_run ? "would-restore" : "restored",
    });
  }
  return result;
}

export async function getDuplicateReconciliationsByKeeperHandler(
  ctx: QueryCtx,
  args: { keeper_replication_id: Id<"replications"> },
) {
  return await ctx.db
    .query("replicationDuplicateReconciliations")
    .withIndex("by_keeper_replication_id", (query) =>
      query.eq("keeper_replication_id", args.keeper_replication_id))
    .take(32);
}
