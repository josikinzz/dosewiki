import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import {
  replicationDateBackfillArgs,
  replicationDateBackfillResult,
  replicationDateResearchReadArgs,
  replicationDateResearchReadRow,
  type ReplicationDateBackfillItem,
} from "./lib/replicationDateValidators";

const MAX_BACKFILL_BATCH = 50;
const MAX_READ_BATCH = 100;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function assertDateItem(item: ReplicationDateBackfillItem) {
  const { date_info: dateInfo } = item;
  if (dateInfo.kind === "unknown") {
    if (dateInfo.value !== undefined) {
      throw new Error(`${item.expected.slug}: unknown date must not carry a value.`);
    }
  } else if (!dateInfo.value?.trim()) {
    throw new Error(`${item.expected.slug}: ${dateInfo.kind} date needs a value.`);
  }

  if (!item.rationale.trim()) {
    throw new Error(`${item.expected.slug}: date research needs a rationale.`);
  }
  if (!item.source_artifact.trim()) {
    throw new Error(`${item.expected.slug}: source_artifact must be non-blank.`);
  }
  if (!SHA256_HEX.test(item.source_artifact_sha256)) {
    throw new Error(`${item.expected.slug}: source_artifact_sha256 is invalid.`);
  }
  if (!SHA256_HEX.test(item.source_record_sha256)) {
    throw new Error(`${item.expected.slug}: source_record_sha256 is invalid.`);
  }
  for (const evidence of item.evidence) {
    if (!evidence.url && !evidence.source_locator) {
      throw new Error(`${item.expected.slug}: evidence needs a URL or source locator.`);
    }
    if (!evidence.description.trim()) {
      throw new Error(`${item.expected.slug}: evidence description must be non-blank.`);
    }
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Compare-and-swap backfill for a bounded batch of replication date research.
 * Identity/editorial fields are assertions only and are never written.
 */
export const applyResearchBatch = mutation({
  args: replicationDateBackfillArgs.fields,
  returns: replicationDateBackfillResult,
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, adminIntent: "replicationMaintenance" }, "admin");
    if (args.items.length === 0 || args.items.length > MAX_BACKFILL_BATCH) {
      throw new Error(`Date backfill batches must contain 1-${MAX_BACKFILL_BATCH} items.`);
    }

    const duplicateIds = new Set<string>();
    const seenIds = new Set<string>();
    for (const item of args.items) {
      const id = String(item.replication_id);
      if (seenIds.has(id)) duplicateIds.add(id);
      seenIds.add(id);
      assertDateItem(item);
    }
    if (duplicateIds.size > 0) {
      throw new Error(`Date backfill batch repeats IDs: ${[...duplicateIds].join(", ")}`);
    }

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const updatedAt = new Date().toISOString();

    for (const item of args.items) {
      const replication = await ctx.db.get(item.replication_id);
      if (!replication) {
        throw new Error(`Replication no longer exists: ${item.replication_id}`);
      }
      if ((replication.role ?? "replication") !== "replication") {
        throw new Error(`${replication.slug}: figures cannot receive replication date research.`);
      }
      for (const field of ["slug", "title", "artist"] as const) {
        if (replication[field] !== item.expected[field]) {
          throw new Error(
            `${item.expected.slug}: production ${field} changed from `
              + `${JSON.stringify(item.expected[field])} to ${JSON.stringify(replication[field])}.`,
          );
        }
      }

      const matches = await ctx.db
        .query("replicationDateResearch")
        .withIndex("by_replication_id", (q) => q.eq("replication_id", item.replication_id))
        .take(2);
      if (matches.length > 1) {
        throw new Error(`${replication.slug}: duplicate date-research rows require repair.`);
      }

      const research = {
        replication_id: item.replication_id,
        replication_slug: replication.slug,
        replication_title: replication.title,
        replication_artist: replication.artist,
        date_info: item.date_info,
        rationale: item.rationale,
        source_urls: item.source_urls,
        evidence: item.evidence,
        ...(item.methods ? { methods: item.methods } : {}),
        ...(item.rejected_dates ? { rejected_dates: item.rejected_dates } : {}),
        ...(item.alternative_dates ? { alternative_dates: item.alternative_dates } : {}),
        source_artifact: item.source_artifact,
        source_artifact_sha256: item.source_artifact_sha256,
        source_record_sha256: item.source_record_sha256,
        schema_version: "replication-date-research-v1" as const,
        updated_at: updatedAt,
      };

      const existing = matches[0];
      const summaryMatches = sameJson(replication.date_info, item.date_info);
      const researchMatches = existing?.source_record_sha256 === item.source_record_sha256
        && existing.source_artifact_sha256 === item.source_artifact_sha256
        && sameJson(existing.date_info, item.date_info);

      if (summaryMatches && researchMatches) {
        unchanged += 1;
        continue;
      }

      if (!summaryMatches) {
        await ctx.db.patch(replication._id, { date_info: item.date_info });
      }
      if (existing) {
        await ctx.db.replace(existing._id, research);
        updated += 1;
      } else {
        await ctx.db.insert("replicationDateResearch", research);
        inserted += 1;
      }
    }

    return { requested: args.items.length, inserted, updated, unchanged };
  },
});

/** Authenticated, bounded verification/read surface for full research dossiers. */
export const getResearchByReplicationIds = query({
  args: replicationDateResearchReadArgs.fields,
  returns: v.array(replicationDateResearchReadRow),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, adminIntent: "replicationMaintenance" }, "admin");
    if (args.replicationIds.length > MAX_READ_BATCH) {
      throw new Error(`Date-research reads are limited to ${MAX_READ_BATCH} IDs.`);
    }

    return await Promise.all(
      args.replicationIds.map(async (replicationId) => {
        const replication = await ctx.db.get(replicationId);
        if (!replication) {
          throw new Error(`Replication no longer exists: ${replicationId}`);
        }
        const matches = await ctx.db
          .query("replicationDateResearch")
          .withIndex("by_replication_id", (q) => q.eq("replication_id", replicationId))
          .take(2);
        if (matches.length > 1) {
          throw new Error(`${replication.slug}: duplicate date-research rows require repair.`);
        }
        const stored = matches[0];
        const research = stored
          ? (({ _id: _id, _creationTime: _creationTime, ...row }) => row)(stored)
          : null;
        return {
          replication_id: replicationId,
          replication_slug: replication.slug,
          ...(replication.date_info ? { date_info: replication.date_info } : {}),
          research,
        };
      }),
    );
  },
});
