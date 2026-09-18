import { type Infer, v } from "../../lib/postgres/runtime/values"

/**
 * The precision/shape of the best defensible temporal statement for a work.
 *
 * A value is not necessarily a creation date. `event_type` says whether it
 * dates creation, first publication, a preserved export, a source post, or
 * another evidence-bearing event. Keeping those concepts separate prevents a
 * database import timestamp or earliest-known appearance from silently turning
 * into an asserted artwork completion date.
 */
export const replicationDateKind = v.union(
  v.literal("exact_date"),
  v.literal("year"),
  v.literal("range"),
  v.literal("upper_bound"),
  v.literal("inferred"),
  v.literal("unknown"),
);

export const replicationDateConfidence = v.union(
  v.literal("high"),
  v.literal("medium-high"),
  v.literal("medium"),
  v.literal("medium-low"),
  v.literal("low"),
  v.literal("none"),
);

/** Compact summary stored on the replication row for cheap public reads. */
export const replicationDateInfo = v.object({
  value: v.optional(v.string()),
  kind: replicationDateKind,
  event_type: v.optional(v.string()),
  confidence: replicationDateConfidence,
  researched_at: v.string(),
});

export const replicationDateEvidence = v.object({
  url: v.optional(v.string()),
  // Local files and repository artifacts can be legitimate evidence even when
  // they have no public URL. They stay in the private research table; no public
  // function exposes this field today.
  source_locator: v.optional(v.string()),
  source_type: v.optional(v.string()),
  description: v.string(),
  retrieved_at: v.optional(v.string()),
  limitations: v.optional(v.string()),
});

export const replicationRejectedDate = v.object({
  value: v.string(),
  reason: v.string(),
});

export const replicationAlternativeDate = v.object({
  value: v.string(),
  kind: replicationDateKind,
  event_type: v.optional(v.string()),
  confidence: replicationDateConfidence,
  rationale: v.optional(v.string()),
  limitations: v.optional(v.string()),
  evidence: v.optional(v.array(replicationDateEvidence)),
});

/** Full research dossier stored one-to-one with a replication. */
export const replicationDateResearch = v.object({
  replication_id: v.id("replications"),
  // Identity snapshot at import time. Current title/artist/slug remain owned by
  // the replication row and are protected by compare-and-swap during backfill.
  replication_slug: v.string(),
  replication_title: v.string(),
  replication_artist: v.string(),
  date_info: replicationDateInfo,
  rationale: v.string(),
  source_urls: v.array(v.string()),
  evidence: v.array(replicationDateEvidence),
  methods: v.optional(v.array(v.string())),
  rejected_dates: v.optional(v.array(replicationRejectedDate)),
  alternative_dates: v.optional(v.array(replicationAlternativeDate)),
  source_artifact: v.string(),
  source_artifact_sha256: v.string(),
  source_record_sha256: v.string(),
  schema_version: v.literal("replication-date-research-v1"),
  updated_at: v.string(),
});

export const replicationDateExpectedIdentity = v.object({
  slug: v.string(),
  title: v.string(),
  artist: v.string(),
});

export const replicationDateBackfillItem = v.object({
  replication_id: v.id("replications"),
  expected: replicationDateExpectedIdentity,
  date_info: replicationDateInfo,
  rationale: v.string(),
  source_urls: v.array(v.string()),
  evidence: v.array(replicationDateEvidence),
  methods: v.optional(v.array(v.string())),
  rejected_dates: v.optional(v.array(replicationRejectedDate)),
  alternative_dates: v.optional(v.array(replicationAlternativeDate)),
  source_artifact: v.string(),
  source_artifact_sha256: v.string(),
  source_record_sha256: v.string(),
});

export const replicationDateBackfillArgs = v.object({
  apiKey: v.optional(v.string()),
  items: v.array(replicationDateBackfillItem),
});

export const replicationDateBackfillResult = v.object({
  requested: v.number(),
  inserted: v.number(),
  updated: v.number(),
  unchanged: v.number(),
});

export const replicationDateResearchReadArgs = v.object({
  apiKey: v.optional(v.string()),
  replicationIds: v.array(v.id("replications")),
});

export const replicationDateResearchReadRow = v.object({
  replication_id: v.id("replications"),
  replication_slug: v.string(),
  date_info: v.optional(replicationDateInfo),
  research: v.union(replicationDateResearch, v.null()),
});

export type ReplicationDateInfo = Infer<typeof replicationDateInfo>;
export type ReplicationDateBackfillItem = Infer<typeof replicationDateBackfillItem>;
