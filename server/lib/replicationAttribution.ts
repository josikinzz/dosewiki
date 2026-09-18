import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { requireAdminIntent } from "./auth";
import type {
  AttributionBatchUpdate,
  AttributionRollbackUpdate,
} from "./replicationAttributionValidators";

const SHA256 = /^[0-9a-f]{64}$/;
const REDDIT_POST_ID = /^[a-z0-9]+$/;

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

export function attributionReplicationSnapshotMatches(
  row: Pick<
    Doc<"replications">,
    | "_id"
    | "slug"
    | "artist"
    | "artist_url"
    | "credit_line"
    | "rightsholder"
    | "source_catalog_id"
    | "source_sha256"
  >,
  expected: AttributionBatchUpdate["expected"],
) {
  return row._id === expected.id
    && row.slug === expected.slug
    && row.artist === expected.artist
    && (row.artist_url ?? null) === expected.artist_url
    && (row.credit_line ?? null) === expected.credit_line
    && (row.rightsholder ?? null) === expected.rightsholder
    && row.source_catalog_id === expected.source_catalog_id
    && row.source_sha256 === expected.source_sha256;
}

export function validateAttributionUpdate(update: AttributionBatchUpdate) {
  const { expected, intended_credit: intended, attribution } = update;
  if (!expected.source_catalog_id.startsWith("reddit-sha256:")) {
    throw new Error(`${expected.slug}: attribution repair is limited to Reddit imports.`);
  }
  if (expected.source_catalog_id !== `reddit-sha256:${expected.source_sha256}`) {
    throw new Error(`${expected.slug}: Reddit catalog ID does not match the source SHA-256.`);
  }
  if (!SHA256.test(expected.source_sha256) || !SHA256.test(attribution.source_digest)) {
    throw new Error(`${expected.slug}: attribution repair has an invalid SHA-256 digest.`);
  }
  if (!intended.artist.trim() || !intended.credit_line.trim()) {
    throw new Error(`${expected.slug}: intended artist and credit line must be non-blank.`);
  }
  if (intended.artist !== attribution.proposed_artist) {
    throw new Error(`${expected.slug}: intended artist does not match the reviewed proposal.`);
  }
  if (intended.artist_url !== null && !isHttpUrl(intended.artist_url)) {
    throw new Error(`${expected.slug}: intended artist URL is invalid.`);
  }

  const poster = attribution.poster;
  if (poster.state === "named") {
    if (!poster.display_name?.trim() || !poster.normalized_name?.trim()) {
      throw new Error(`${expected.slug}: named poster needs display and normalized names.`);
    }
    if (poster.normalized_name !== poster.display_name.trim().toLocaleLowerCase("en-US")) {
      throw new Error(`${expected.slug}: named poster has a non-canonical normalized name.`);
    }
    if (!poster.profile_url || !isRedditProfileUrl(poster.profile_url)) {
      throw new Error(`${expected.slug}: named poster needs a Reddit profile URL.`);
    }
  } else if (poster.profile_url !== undefined) {
    throw new Error(`${expected.slug}: non-singular poster state cannot claim one profile URL.`);
  }

  if (
    attribution.disposition === "poster-as-artist-default"
    && (poster.state !== "named" || intended.artist !== poster.display_name)
  ) {
    throw new Error(`${expected.slug}: poster-default credit does not match the named poster.`);
  }
  if (
    attribution.disposition === "reviewed-creator-override"
    && (
      !attribution.reviewed_creator_override
      || intended.artist !== attribution.reviewed_creator_override.creator_name
    )
  ) {
    throw new Error(`${expected.slug}: creator override is absent or does not match.`);
  }
  if (
    attribution.disposition === "multiple-posters-require-review"
    && (!attribution.review_required || poster.state !== "multiple")
  ) {
    throw new Error(`${expected.slug}: multiple-poster attribution must remain review-required.`);
  }
  if (
    attribution.disposition === "unknown-no-named-poster"
    && intended.artist !== "Unknown Artist"
  ) {
    throw new Error(`${expected.slug}: missing/deleted poster must retain Unknown Artist.`);
  }

  if (attribution.reddit_post_ids.length === 0 || attribution.source_references.length === 0) {
    throw new Error(`${expected.slug}: attribution needs at least one Reddit source reference.`);
  }
  if (attribution.source_references.length > 32) {
    throw new Error(`${expected.slug}: attribution exceeds the 32-reference safety cap.`);
  }
  const postIds = new Set(attribution.reddit_post_ids);
  if (
    postIds.size !== attribution.reddit_post_ids.length
    || [...postIds].some((postId) => !REDDIT_POST_ID.test(postId))
  ) {
    throw new Error(`${expected.slug}: Reddit post IDs must be unique lowercase identifiers.`);
  }
  const referenceIds = new Set<string>();
  for (const reference of attribution.source_references) {
    if (referenceIds.has(reference.reference_id)) {
      throw new Error(`${expected.slug}: duplicate source reference ${reference.reference_id}.`);
    }
    referenceIds.add(reference.reference_id);
    if (!postIds.has(reference.post_id) || !isHttpUrl(reference.post_url)) {
      throw new Error(`${expected.slug}: source reference is not bound to a valid Reddit post.`);
    }
    if (reference.poster_profile_url && !isRedditProfileUrl(reference.poster_profile_url)) {
      throw new Error(`${expected.slug}: source reference has an invalid poster profile URL.`);
    }
    if (reference.source_url && !isHttpUrl(reference.source_url)) {
      throw new Error(`${expected.slug}: source reference has an invalid source URL.`);
    }
  }
}

async function requireScopedMaintenance(apiKey: string) {
  const authorization = await requireAdminIntent(apiKey, "replicationMaintenance");
  if (authorization.source !== "scoped") {
    throw new Error(
      "Attribution repair requires the scoped replicationMaintenance credential.",
    );
  }
}

export async function applyAttributionBatchHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    operation_id: string;
    dry_run?: boolean;
    updates: AttributionBatchUpdate[];
  },
) {
  await requireScopedMaintenance(args.apiKey);
  if (!args.operation_id.trim()) throw new Error("Attribution operation ID is required.");
  if (args.updates.length === 0 || args.updates.length > 50) {
    throw new Error("Attribution batches must contain 1 to 50 updates.");
  }

  let updated = 0;
  let unchanged = 0;
  const plannedIds = new Set<string>();
  for (const update of args.updates) {
    validateAttributionUpdate(update);
    if (plannedIds.has(update.expected.id)) {
      throw new Error(`Attribution batch repeats ${update.expected.id}.`);
    }
    plannedIds.add(update.expected.id);
    const row = await ctx.db.get(update.expected.id);
    if (!row || !attributionReplicationSnapshotMatches(row, update.expected)) {
      throw new Error(`Replication attribution CAS precondition failed: ${update.expected.slug}.`);
    }

    const existing = await ctx.db
      .query("replicationSourceAttribution")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", update.expected.id))
      .unique();
    if (existing && existing.source_digest !== update.attribution.source_digest) {
      throw new Error(`Attribution evidence drifted for ${update.expected.slug}.`);
    }

    const intended = update.intended_credit;
    const alreadyCredited = row.artist === intended.artist
      && (row.artist_url ?? null) === intended.artist_url
      && (row.credit_line ?? null) === intended.credit_line
      && (row.rightsholder ?? null) === intended.rightsholder;
    if (!args.dry_run && !alreadyCredited) {
      await ctx.db.patch(row._id, {
        artist: intended.artist,
        ...(intended.artist_url === null ? { artist_url: undefined } : { artist_url: intended.artist_url }),
        credit_line: intended.credit_line,
        ...(intended.rightsholder === null
          ? { rightsholder: undefined }
          : { rightsholder: intended.rightsholder }),
      });
    }

    const attributionRecord = {
      replication_id: row._id,
      source_catalog_id: update.expected.source_catalog_id,
      source_sha256: update.expected.source_sha256,
      ...update.attribution,
      operation_id: args.operation_id,
      updated_at: Date.now(),
    };
    if (existing) {
      const existingProjection = {
        replication_id: existing.replication_id,
        source_catalog_id: existing.source_catalog_id,
        source_sha256: existing.source_sha256,
        reddit_post_ids: existing.reddit_post_ids,
        poster: existing.poster,
        source_references: existing.source_references,
        disposition: existing.disposition,
        proposed_artist: existing.proposed_artist,
        reviewed_creator_override: existing.reviewed_creator_override,
        review_required: existing.review_required,
        source_digest: existing.source_digest,
      };
      const intendedProjection = {
        replication_id: attributionRecord.replication_id,
        source_catalog_id: attributionRecord.source_catalog_id,
        source_sha256: attributionRecord.source_sha256,
        reddit_post_ids: attributionRecord.reddit_post_ids,
        poster: attributionRecord.poster,
        source_references: attributionRecord.source_references,
        disposition: attributionRecord.disposition,
        proposed_artist: attributionRecord.proposed_artist,
        reviewed_creator_override: attributionRecord.reviewed_creator_override,
        review_required: attributionRecord.review_required,
        source_digest: attributionRecord.source_digest,
      };
      if (JSON.stringify(existingProjection) !== JSON.stringify(intendedProjection)) {
        throw new Error(`Stored attribution record drifted for ${update.expected.slug}.`);
      }
    }
    if (!args.dry_run && !existing) {
      await ctx.db.insert("replicationSourceAttribution", attributionRecord);
    }
    if (alreadyCredited && existing) unchanged++;
    else updated++;
  }
  return { updated, unchanged };
}

function attributionIdentityMatches(
  row: Pick<
    Doc<"replications">,
    "_id" | "slug" | "source_catalog_id" | "source_sha256"
  >,
  expected: AttributionRollbackUpdate["expected_current"],
) {
  return row._id === expected.id
    && row.slug === expected.slug
    && row.source_catalog_id === expected.source_catalog_id
    && row.source_sha256 === expected.source_sha256;
}

function attributionCreditMatches(
  row: Pick<
    Doc<"replications">,
    "artist" | "artist_url" | "credit_line" | "rightsholder"
  >,
  expected: Pick<
    AttributionRollbackUpdate["expected_current"],
    "artist" | "artist_url" | "credit_line" | "rightsholder"
  >,
) {
  return row.artist === expected.artist
    && (row.artist_url ?? null) === expected.artist_url
    && (row.credit_line ?? null) === expected.credit_line
    && (row.rightsholder ?? null) === expected.rightsholder;
}

export async function rollbackAttributionBatchHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    operation_id: string;
    dry_run: boolean;
    updates: AttributionRollbackUpdate[];
  },
) {
  await requireScopedMaintenance(args.apiKey);
  if (!args.operation_id.trim()) throw new Error("Attribution rollback operation ID is required.");
  if (args.updates.length === 0 || args.updates.length > 50) {
    throw new Error("Attribution rollback batches must contain 1 to 50 updates.");
  }

  let restored = 0;
  let unchanged = 0;
  const plannedIds = new Set<string>();
  for (const update of args.updates) {
    if (plannedIds.has(update.expected_current.id)) {
      throw new Error(`Attribution rollback repeats ${update.expected_current.id}.`);
    }
    plannedIds.add(update.expected_current.id);
    if (!SHA256.test(update.source_digest) || !update.expected_attribution_operation_id.trim()) {
      throw new Error(`${update.expected_current.slug}: invalid attribution rollback evidence.`);
    }
    const row = await ctx.db.get(update.expected_current.id);
    if (!row || !attributionIdentityMatches(row, update.expected_current)) {
      throw new Error(`Replication attribution rollback identity failed: ${update.expected_current.slug}.`);
    }
    const existing = await ctx.db
      .query("replicationSourceAttribution")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", update.expected_current.id))
      .unique();
    const alreadyRestored = attributionCreditMatches(row, update.rollback_credit) && !existing;
    if (alreadyRestored) {
      unchanged++;
      continue;
    }
    if (!attributionCreditMatches(row, update.expected_current)) {
      throw new Error(`Replication attribution rollback credit CAS failed: ${update.expected_current.slug}.`);
    }
    if (
      !existing
      || existing.source_digest !== update.source_digest
      || existing.operation_id !== update.expected_attribution_operation_id
    ) {
      throw new Error(`Stored attribution rollback evidence drifted for ${update.expected_current.slug}.`);
    }
    if (!args.dry_run) {
      await ctx.db.patch(row._id, {
        artist: update.rollback_credit.artist,
        ...(update.rollback_credit.artist_url === null
          ? { artist_url: undefined }
          : { artist_url: update.rollback_credit.artist_url }),
        ...(update.rollback_credit.credit_line === null
          ? { credit_line: undefined }
          : { credit_line: update.rollback_credit.credit_line }),
        ...(update.rollback_credit.rightsholder === null
          ? { rightsholder: undefined }
          : { rightsholder: update.rollback_credit.rightsholder }),
      });
      await ctx.db.delete(existing._id);
    }
    restored++;
  }
  return { restored, unchanged };
}
