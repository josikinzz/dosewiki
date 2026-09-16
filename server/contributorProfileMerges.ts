import { v } from "../lib/postgres/runtime/values";
import type { Id } from "../lib/postgres/runtime/dataModel";
import type { MutationCtx, QueryCtx } from "../lib/postgres/runtime/server";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import {
  contributorProfileMergeInputValidator,
  contributorProfileMergeOperationValidator,
  type ContributorProfileMergeInput,
  type ContributorProfileMergeTable,
} from "./lib/contributorProfileMergeValidators";
import { normalizeProfileAliases, normalizeProfileKey } from "../lib/contributorProfileIdentity";

const PINNED_SNAPSHOT_DIGEST = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";
const PINNED_PROFILE_COUNT = 2_119;
const SHA256 = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const APPROVED = new Map([
  ["kx72vtw19621c4kmbwjt0127558dhbvw", { sourceKey: "WHERESSUEDE", targetId: "kx77dw7zwgzk9p8byv1b75ny958c9adm", targetKey: "LOKA" }],
  ["kx720hr6135j0rb6mdm85r3mc18dgza9", { sourceKey: "WOOODFIELD", targetId: "kx78gb99p7e7p80q92rrsy5bas8c975b", targetKey: "PHOSFORM" }],
]);
const LIMITS = { attributions: 500, aliases: 100, avatars: 100, bindings: 500, reports: 100 } as const;
type Ctx = QueryCtx | MutationCtx;
type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Change = { table: ContributorProfileMergeTable; rowId: string; before: Row; after: Row };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function canonicalProfileMergeJson(value: unknown) { return JSON.stringify(canonical(value)); }
export async function profileMergeDigest(value: unknown) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalProfileMergeJson(value)));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function withoutSystem(row: Row) {
  const { _id: _id, _creationTime: _creationTime, ...value } = row;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
function equal(left: unknown, right: unknown) { return canonicalProfileMergeJson(left) === canonicalProfileMergeJson(right); }
function assertBounded<T>(rows: T[], limit: number, label: string) {
  if (rows.length > limit) throw new Error(`${label} exceeds the reviewed merge bound of ${limit}.`);
  return rows;
}
export function assertProfileMergeInput(input: ContributorProfileMergeInput) {
  if (input.pinned_snapshot_digest !== PINNED_SNAPSHOT_DIGEST || input.pinned_snapshot_profile_count !== PINNED_PROFILE_COUNT) throw new Error("Profile merge is not pinned to the reviewed 2,119-profile snapshot.");
  if (!SHA256.test(input.expected_state_digest)) throw new Error("Expected state digest must be a lowercase SHA-256 digest.");
  if (!Number.isSafeInteger(input.applied_at) || input.applied_at <= 0) throw new Error("Profile merge applied_at must be a positive integer timestamp.");
  const approved = APPROVED.get(input.source_profile_id);
  if (!approved || approved.sourceKey !== normalizeProfileKey(input.source_key) || approved.targetId !== input.target_profile_id || approved.targetKey !== normalizeProfileKey(input.target_key)) throw new Error("Profile merge pair is not one of the two owner-approved immutable-ID pairs.");
}
async function byProfile(ctx: Ctx, table: "contributorAliasEvidence" | "contributorAvatarHistory" | "replicationIdentityProfileBindings", profileId: Id<"contributorProfiles">, limit: number) {
  return assertBounded(await ctx.db.query(table).withIndex("by_profile_id", (q) => q.eq("profile_id", profileId)).take(limit + 1) as Row[], limit, table);
}
async function captureState(ctx: Ctx, input: ContributorProfileMergeInput) {
  assertProfileMergeInput(input);
  const source = await ctx.db.get(input.source_profile_id) as Row | null;
  const target = await ctx.db.get(input.target_profile_id) as Row | null;
  if (!source || source.key !== normalizeProfileKey(input.source_key)) throw new Error("Source profile immutable ID/key precondition failed.");
  if (!target || target.key !== normalizeProfileKey(input.target_key)) throw new Error("Target profile immutable ID/key precondition failed.");
  if (source.mergedIntoProfileId || target.mergedIntoProfileId) throw new Error("Nested or repeated profile merges are not permitted.");
  if (input.source_profile_id === input.target_profile_id) throw new Error("A profile cannot be merged into itself.");
  const sourceId = input.source_profile_id; const targetId = input.target_profile_id;
  const [posterSource, creatorSource, posterTarget, creatorTarget, sourceAliases, targetAliases, sourceAvatars, targetAvatars, sourceBindings, targetBindings, sourceReports, targetReports, sourceVerification, targetVerification] = await Promise.all([
    ctx.db.query("replicationIdentityAttributions").withIndex("by_poster_profile_id", (q) => q.eq("poster_profile_id", sourceId)).take(LIMITS.attributions + 1),
    ctx.db.query("replicationIdentityAttributions").withIndex("by_creator_profile_id", (q) => q.eq("creator_profile_id", sourceId)).take(LIMITS.attributions + 1),
    ctx.db.query("replicationIdentityAttributions").withIndex("by_poster_profile_id", (q) => q.eq("poster_profile_id", targetId)).take(LIMITS.attributions + 1),
    ctx.db.query("replicationIdentityAttributions").withIndex("by_creator_profile_id", (q) => q.eq("creator_profile_id", targetId)).take(LIMITS.attributions + 1),
    byProfile(ctx, "contributorAliasEvidence", sourceId, LIMITS.aliases), byProfile(ctx, "contributorAliasEvidence", targetId, LIMITS.aliases),
    byProfile(ctx, "contributorAvatarHistory", sourceId, LIMITS.avatars), byProfile(ctx, "contributorAvatarHistory", targetId, LIMITS.avatars),
    byProfile(ctx, "replicationIdentityProfileBindings", sourceId, LIMITS.bindings), byProfile(ctx, "replicationIdentityProfileBindings", targetId, LIMITS.bindings),
    ctx.db.query("tripReports").withIndex("by_subject_profile_key", (q) => q.eq("subject.profile_key", normalizeProfileKey(input.source_key))).take(LIMITS.reports + 1),
    ctx.db.query("tripReports").withIndex("by_subject_profile_key", (q) => q.eq("subject.profile_key", normalizeProfileKey(input.target_key))).take(LIMITS.reports + 1),
    ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", sourceId)).unique(),
    ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", targetId)).unique(),
  ]);
  assertBounded(posterSource, LIMITS.attributions, "source poster attributions");
  assertBounded(creatorSource, LIMITS.attributions, "source creator attributions");
  assertBounded(posterTarget, LIMITS.attributions, "target poster attributions");
  assertBounded(creatorTarget, LIMITS.attributions, "target creator attributions");
  assertBounded(sourceReports, LIMITS.reports, "source reports");
  assertBounded(targetReports, LIMITS.reports, "target reports");
  const attributionMap = new Map<string, Row>();
  for (const row of [...posterSource, ...creatorSource, ...posterTarget, ...creatorTarget] as Row[]) attributionMap.set(row._id, row);
  const tokens = normalizeProfileAliases([source.key as string, source.displayName as string, ...((source.aliases as string[]) ?? []), target.key as string, target.displayName as string, ...((target.aliases as string[]) ?? [])]);
  const identityTokens = [];
  for (const token of tokens) {
    const row = await ctx.db.query("contributorIdentityTokenSnapshots").withIndex("by_snapshot_digest_and_normalized_token", (q) => q.eq("snapshot_digest", PINNED_SNAPSHOT_DIGEST).eq("normalized_token", token)).unique();
    if (row) identityTokens.push(row);
  }
  const state = {
    source, target,
    attributions: [...attributionMap.values()].sort((a, b) => a._id.localeCompare(b._id)),
    sourceAliases, targetAliases, sourceAvatars, targetAvatars, sourceBindings, targetBindings,
    sourceReports, targetReports, sourceVerification, targetVerification,
    identityTokens: identityTokens.sort((a, b) => a.normalized_token.localeCompare(b.normalized_token)),
  };
  return { state, digest: await profileMergeDigest(state) };
}
function mergeLinks(target: unknown, source: unknown) {
  const output: Array<{ label: string; url: string }> = []; const seen = new Set<string>();
  for (const link of [...((target as Array<{ label: string; url: string }>) ?? []), ...((source as Array<{ label: string; url: string }>) ?? [])]) {
    const normalizedUrl = link.url.trim();
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    // The trim is only a duplicate/blankness key. Keep the stored link bytes
    // intact so a merge advertised as lossless never silently rewrites them.
    output.push({ label: link.label, url: link.url });
  }
  return output;
}
function verificationRank(status: unknown) { return status === "verified" ? 3 : status === "unclear" ? 2 : status === "not-verified" ? 1 : 0; }
export async function plannedProfileMergeChanges(input: ContributorProfileMergeInput, captured: Awaited<ReturnType<typeof captureState>>) {
  const { state } = captured; const source = state.source; const target = state.target;
  const sourceMembership = source.membershipEmail as string | undefined; const targetMembership = target.membershipEmail as string | undefined;
  if (sourceMembership && targetMembership && sourceMembership.toLowerCase() !== targetMembership.toLowerCase()) throw new Error("Cross-profile ambiguity: both profiles have different membership owners.");
  for (const token of state.identityTokens) {
    const owners = token.owner_profile_ids as string[];
    if (owners.some((id) => id !== input.source_profile_id && id !== input.target_profile_id)) throw new Error(`Cross-profile ambiguity: reviewed identity token ${token.normalized_token} has another owner.`);
  }
  const aliases = normalizeProfileAliases([...(target.aliases as string[] ?? []), source.key as string, source.displayName as string, ...(source.aliases as string[] ?? [])]);
  const targetAfter: Row = { ...target, aliases, links: mergeLinks(target.links, source.links),
    bio: (target.bio as string)?.trim() ? target.bio : source.bio,
    role: target.role ?? source.role,
    membershipEmail: target.membershipEmail ?? source.membershipEmail,
    replicationOrder: Array.from(new Set([...(target.replicationOrder as string[] ?? []), ...(source.replicationOrder as string[] ?? [])])),
    reportOrder: Array.from(new Set([...(target.reportOrder as string[] ?? []), ...(source.reportOrder as string[] ?? [])])),
    exclude_from_gallery: target.exclude_from_gallery === true || source.exclude_from_gallery === true ? true : undefined,
    archival: target.archival === true || source.archival === true ? true : undefined,
    approved_replicator: target.approved_replicator === true || source.approved_replicator === true ? true : undefined,
  };
  const sourceAfter: Row = { ...source, mergedIntoProfileId: input.target_profile_id, mergedIntoKey: normalizeProfileKey(input.target_key), mergedByOperationId: "", mergedAt: input.applied_at };
  const changes: Change[] = [
    { table: "contributorProfiles", rowId: target._id, before: target, after: targetAfter },
    { table: "contributorProfiles", rowId: source._id, before: source, after: sourceAfter },
  ];
  const attributionRows = state.attributions as Row[];
  for (const row of attributionRows) {
    const after = { ...row };
    if (after.poster_profile_id === input.source_profile_id) after.poster_profile_id = input.target_profile_id;
    if (after.creator_profile_id === input.source_profile_id) after.creator_profile_id = input.target_profile_id;
    if (!equal(row, after)) changes.push({ table: "replicationIdentityAttributions", rowId: row._id, before: row, after });
  }
  for (const row of state.sourceBindings as Row[]) changes.push({ table: "replicationIdentityProfileBindings", rowId: row._id, before: row, after: { ...row, profile_id: input.target_profile_id, profile_key: normalizeProfileKey(input.target_key) } });
  for (const row of state.sourceReports as Row[]) changes.push({ table: "tripReports", rowId: row._id, before: row, after: { ...row, subject: { ...(row.subject as Record<string, unknown>), profile_key: normalizeProfileKey(input.target_key) } } });
  const sv = state.sourceVerification as Row | null; const tv = state.targetVerification as Row | null;
  if (sv && !tv) throw new Error("Target verification is absent; lossless verification aggregation requires an explicit target record.");
  if (sv && tv) {
    const winner = verificationRank(sv.status) > verificationRank(tv.status) ? sv : tv;
    const contributions = [...((tv.review_contributions as unknown[]) ?? [{ artist_id: `profile:${target.key}`, status: tv.status, basis: tv.basis, work_count_reviewed: tv.work_count_reviewed, rationale: tv.rationale, evidence: tv.evidence, source_digest: tv.source_digest }]), ...((sv.review_contributions as unknown[]) ?? [{ artist_id: `profile:${source.key}`, status: sv.status, basis: sv.basis, work_count_reviewed: sv.work_count_reviewed, rationale: sv.rationale, evidence: sv.evidence, source_digest: sv.source_digest }])];
    const after = { ...tv, status: winner.status, basis: winner.basis, work_count_reviewed: Math.max(Number(tv.work_count_reviewed), Number(sv.work_count_reviewed)), rationale: winner.rationale, evidence: winner.evidence, source_digest: await profileMergeDigest(contributions), review_contributions: contributions, operation_id: "" };
    changes.push({ table: "contributorReplicatorVerifications", rowId: tv._id, before: tv, after });
  }
  return changes;
}
export function bindProfileMergeOperation(changes: Change[], operationId: string) {
  return changes.map((change) => ({ ...change, after: { ...change.after,
    ...(change.table === "contributorProfiles" && change.rowId === changes[1]?.rowId ? { mergedByOperationId: operationId } : {}),
    ...(change.table === "contributorReplicatorVerifications" ? { operation_id: operationId } : {}),
  } }));
}
async function assertLive(ctx: Ctx, changes: Change[], side: "before" | "after") {
  for (const change of changes) {
    const current = await ctx.db.get(change.rowId as never) as Row | null;
    if (!current || !equal(current, change[side])) throw new Error(`Profile merge ${side} CAS failed for ${change.table}:${change.rowId}.`);
  }
}
const result = v.object({ operation_id: v.string(), payload_digest: v.string(), state_digest: v.string(), item_count: v.number(), idempotent_replay: v.boolean(), dry_run: v.boolean() });

export async function previewProfileMergeHandler(
  ctx: QueryCtx,
  args: { apiKey: string; actor_email: string; input: ContributorProfileMergeInput },
) {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" }, "admin");
    const captured = await captureState(ctx, args.input);
    return { state_digest: captured.digest, source_profile_id: args.input.source_profile_id, target_profile_id: args.input.target_profile_id, attribution_count: captured.state.attributions.length, binding_count: captured.state.sourceBindings.length, report_count: captured.state.sourceReports.length };
}

export const preview = query({
  args: { apiKey: v.string(), actor_email: v.string(), input: contributorProfileMergeInputValidator },
  returns: v.object({ state_digest: v.string(), source_profile_id: v.id("contributorProfiles"), target_profile_id: v.id("contributorProfiles"), attribution_count: v.number(), binding_count: v.number(), report_count: v.number() }),
  handler: previewProfileMergeHandler,
});

export async function applyProfileMergeHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    actor_email: string;
    operation_id: string;
    dry_run: boolean;
    input: ContributorProfileMergeInput;
  },
) {
    const actor = await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" }, "admin");
    const payloadDigest = await profileMergeDigest({ operation_id: args.operation_id, input: args.input });
    const existing = await ctx.db.query("contributorProfileMergeOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", args.operation_id)).unique();
    if (existing) {
      if (existing.payload_digest !== payloadDigest || existing.status !== "applied") throw new Error("Profile merge operation ID collision or rolled-back replay.");
      const items = await ctx.db.query("contributorProfileMergeItems").withIndex("by_operation_id_and_ordinal", (q) => q.eq("operation_id", args.operation_id)).take(existing.item_count + 1);
      if (items.length !== existing.item_count) throw new Error("Profile merge receipt is incomplete.");
      await assertLive(ctx, items.map((item) => ({ table: item.table, rowId: item.row_id, before: item.before as Row, after: item.after as Row })), "after");
      return { operation_id: args.operation_id, payload_digest: payloadDigest, state_digest: existing.applied_state_digest, item_count: existing.item_count, idempotent_replay: true, dry_run: false };
    }
    const captured = await captureState(ctx, args.input);
    if (captured.digest !== args.input.expected_state_digest) throw new Error("Profile merge current-state digest drifted; regenerate the authenticated preview.");
    const changes = bindProfileMergeOperation(await plannedProfileMergeChanges(args.input, captured), args.operation_id);
    const appliedStateDigest = await profileMergeDigest(changes.map(({ table, rowId, after }) => ({ table, rowId, after })));
    if (!args.dry_run) {
      await assertLive(ctx, changes, "before");
      for (const change of changes) await ctx.db.replace(change.rowId as never, withoutSystem(change.after) as never);
      for (let ordinal = 0; ordinal < changes.length; ordinal++) { const change = changes[ordinal]; await ctx.db.insert("contributorProfileMergeItems", { operation_id: args.operation_id, ordinal, table: change.table, row_id: change.rowId, before: change.before, after: change.after, created_at: args.input.applied_at }); }
      await ctx.db.insert("contributorProfileMergeOperations", { operation_id: args.operation_id, payload_digest: payloadDigest, source_profile_id: args.input.source_profile_id, source_key: normalizeProfileKey(args.input.source_key), target_profile_id: args.input.target_profile_id, target_key: normalizeProfileKey(args.input.target_key), pinned_snapshot_digest: args.input.pinned_snapshot_digest, pinned_snapshot_profile_count: args.input.pinned_snapshot_profile_count, expected_state_digest: captured.digest, applied_state_digest: appliedStateDigest, actor_email: actor.email, item_count: changes.length, status: "applied", created_at: args.input.applied_at });
    }
    return { operation_id: args.operation_id, payload_digest: payloadDigest, state_digest: appliedStateDigest, item_count: changes.length, idempotent_replay: false, dry_run: args.dry_run };
}

export const apply = mutation({
  args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), dry_run: v.boolean(), input: contributorProfileMergeInputValidator }, returns: result,
  handler: applyProfileMergeHandler,
});

export async function profileMergeReceiptHandler(
  ctx: QueryCtx,
  args: { apiKey: string; actor_email: string; operation_id: string },
) {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" }, "admin");
    const operation = await ctx.db.query("contributorProfileMergeOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", args.operation_id)).unique(); if (!operation) return null;
    const { _id: _operationId, _creationTime: _operationCreationTime, ...receiptOperation } = operation;
    const items = await ctx.db.query("contributorProfileMergeItems").withIndex("by_operation_id_and_ordinal", (q) => q.eq("operation_id", args.operation_id)).take(operation.item_count + 1);
    if (items.length !== operation.item_count) return { operation: receiptOperation, live_matches: false, checked_items: items.length };
    try { await assertLive(ctx, items.map((item) => ({ table: item.table, rowId: item.row_id, before: item.before as Row, after: item.after as Row })), operation.status === "applied" ? "after" : "before"); return { operation: receiptOperation, live_matches: true, checked_items: items.length }; } catch { return { operation: receiptOperation, live_matches: false, checked_items: items.length }; }
}

export const receipt = query({
  args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string() },
  returns: v.union(v.object({ operation: contributorProfileMergeOperationValidator, live_matches: v.boolean(), checked_items: v.number() }), v.null()),
  handler: profileMergeReceiptHandler,
});

export async function rollbackProfileMergeHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    actor_email: string;
    operation_id: string;
    rollback_of: string;
    dry_run: boolean;
  },
) {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" }, "admin");
    const operation = await ctx.db.query("contributorProfileMergeOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", args.rollback_of)).unique();
    if (!operation) throw new Error("Profile merge rollback target does not exist.");
    if (operation.status === "rolled-back") { if (operation.rollback_operation_id !== args.operation_id) throw new Error("Profile merge was rolled back by another operation."); return { operation_id: args.operation_id, payload_digest: operation.payload_digest, state_digest: operation.expected_state_digest, item_count: operation.item_count, idempotent_replay: true, dry_run: false }; }
    const [appliedCollision, rollbackCollision] = await Promise.all([
      ctx.db.query("contributorProfileMergeOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", args.operation_id)).unique(),
      ctx.db.query("contributorProfileMergeOperations").withIndex("by_rollback_operation_id", (q) => q.eq("rollback_operation_id", args.operation_id)).unique(),
    ]);
    if (appliedCollision || rollbackCollision) throw new Error("Profile merge rollback operation ID collision.");
    const items = await ctx.db.query("contributorProfileMergeItems").withIndex("by_operation_id_and_ordinal", (q) => q.eq("operation_id", args.rollback_of)).take(operation.item_count + 1);
    if (items.length !== operation.item_count) throw new Error("Profile merge rollback journal is incomplete.");
    const changes = items.map((item) => ({ table: item.table, rowId: item.row_id, before: item.before as Row, after: item.after as Row })); await assertLive(ctx, changes, "after");
    if (!args.dry_run) { for (const change of [...changes].reverse()) await ctx.db.replace(change.rowId as never, withoutSystem(change.before) as never); await ctx.db.patch(operation._id, { status: "rolled-back", rollback_operation_id: args.operation_id, rolled_back_at: Date.now() }); }
    return { operation_id: args.operation_id, payload_digest: operation.payload_digest, state_digest: operation.expected_state_digest, item_count: operation.item_count, idempotent_replay: false, dry_run: args.dry_run };
}

export const rollback = mutation({
  args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), rollback_of: v.string(), dry_run: v.boolean() }, returns: result,
  handler: rollbackProfileMergeHandler,
});
