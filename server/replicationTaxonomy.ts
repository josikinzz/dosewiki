import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc, Id } from "../lib/postgres/runtime/dataModel";
import { requireRole } from "./lib/auth";
import { replicationTaxonomyLocatorMatches } from "./lib/replicationTaxonomyCas";
import {
  artistPrimaryTypeValidator,
  artistTypeTagValidator,
  contentFamilyValidator,
  drugClassValidator,
  replicationArtistTaxonomyUpdateValidator,
  replicationStatusValidator,
  replicationTaxonomyUpdateValidator,
  taxonomyConfidenceValidator,
  titleClassMentionValidator,
  titleDrugValidator,
  viewingModeTagValidator,
  viewingModeValidator,
} from "./lib/replicationTaxonomyValidators";

const mediaTypeValidator = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("audio"),
);

const mediaRoleValidator = v.union(v.literal("replication"), v.literal("figure"));

const nullableString = v.union(v.string(), v.null());

const taxonomyProjectionValidator = v.object({
  id: v.id("replications"),
  slug: v.string(),
  title: v.string(),
  artist: v.string(),
  type: mediaTypeValidator,
  role: v.union(mediaRoleValidator, v.null()),
  effect_slug: nullableString,
  showcase_excluded: v.boolean(),
  created_at: nullableString,
  storage_id: nullableString,
  r2_key: nullableString,
  url: nullableString,
  source_catalog_id: nullableString,
  taxonomy_record_key: nullableString,
  replication_status: v.union(replicationStatusValidator, v.null()),
  viewing_mode: v.union(viewingModeValidator, v.null()),
  viewing_mode_tags: v.array(viewingModeTagValidator),
  title_drugs: v.array(titleDrugValidator),
  title_class_mentions: v.array(titleClassMentionValidator),
  drug_classes: v.array(drugClassValidator),
  content_family: v.union(contentFamilyValidator, v.null()),
  content_tags: v.array(v.string()),
  taxonomy_version: v.union(v.number(), v.null()),
  taxonomy_source_digest: nullableString,
});

const artistProjectionValidator = v.object({
  key: v.string(),
  display_name: v.string(),
  primary_type: artistPrimaryTypeValidator,
  artist_type_tags: v.array(artistTypeTagValidator),
  confidence: taxonomyConfidenceValidator,
  review_required: v.boolean(),
  taxonomy_version: v.number(),
  taxonomy_source_digest: v.string(),
});

function projectReplication(row: Doc<"replications">) {
  return {
    id: row._id,
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    type: row.type,
    role: row.role ?? null,
    effect_slug: row.effect_slug ?? null,
    showcase_excluded: row.showcase_excluded ?? false,
    created_at: row.created_at ?? null,
    storage_id: row.storage_id ?? null,
    r2_key: row.r2_key ?? null,
    url: row.url ?? null,
    source_catalog_id: row.source_catalog_id ?? null,
    taxonomy_record_key: row.taxonomy_record_key ?? null,
    replication_status: row.replication_status ?? null,
    viewing_mode: row.viewing_mode ?? null,
    viewing_mode_tags: row.viewing_mode_tags ?? [],
    title_drugs: row.title_drugs ?? [],
    title_class_mentions: row.title_class_mentions ?? [],
    drug_classes: row.drug_classes ?? [],
    content_family: row.content_family ?? null,
    content_tags: row.content_tags ?? [],
    taxonomy_version: row.taxonomy_version ?? null,
    taxonomy_source_digest: row.taxonomy_source_digest ?? null,
  };
}

/** Authenticated, bounded migration read. Maintenance tools never need getAll. */
export const getMigrationPage = query({
  args: {
    apiKey: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.number(),
  },
  returns: v.object({
    rows: v.array(taxonomyProjectionValidator),
    cursor: nullableString,
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "replicationMaintenance" },
      "admin",
    );
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit)));
    const page = await ctx.db.query("replications").order("asc").paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });
    return {
      rows: page.page.map(projectReplication),
      cursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Targeted read-back used after every canary and resumable batch. */
export const getByIds = query({
  args: {
    apiKey: v.optional(v.string()),
    ids: v.array(v.id("replications")),
  },
  returns: v.object({
    rows: v.array(taxonomyProjectionValidator),
    missing: v.array(v.id("replications")),
  }),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "replicationMaintenance" },
      "admin",
    );
    if (args.ids.length > 100) throw new Error("Taxonomy read-back is limited to 100 rows.");
    const rows: ReturnType<typeof projectReplication>[] = [];
    const missing: Id<"replications">[] = [];
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (!row) missing.push(id);
      else rows.push(projectReplication(row));
    }
    return { rows, missing };
  },
});

export const getArtistsByKeys = query({
  args: {
    apiKey: v.optional(v.string()),
    keys: v.array(v.string()),
  },
  returns: v.array(artistProjectionValidator),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "replicationMaintenance" },
      "admin",
    );
    if (args.keys.length > 200) throw new Error("Artist taxonomy read-back is limited to 200 rows.");
    const rows = [];
    for (const rawKey of args.keys) {
      const key = rawKey.trim().toLowerCase();
      if (!key) continue;
      const row = await ctx.db
        .query("replicationArtistTaxonomy")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (row) {
        rows.push({
          key: row.key,
          display_name: row.display_name,
          primary_type: row.primary_type,
          artist_type_tags: row.artist_type_tags,
          confidence: row.confidence,
          review_required: row.review_required,
          taxonomy_version: row.taxonomy_version,
          taxonomy_source_digest: row.taxonomy_source_digest,
        });
      }
    }
    return rows;
  },
});

/** Public gallery metadata only; rationales and review evidence stay private. */
export const getPublicArtistsByKeys = query({
  args: { keys: v.array(v.string()) },
  returns: v.array(
    v.object({
      key: v.string(),
      primary_type: artistPrimaryTypeValidator,
      artist_type_tags: v.array(artistTypeTagValidator),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.keys.length > 200) {
      throw new Error("Public artist taxonomy reads are limited to 200 keys.");
    }
    // Preserve the historical output contract: exact repeated raw inputs
    // collapse, while differently formatted inputs that normalize to the same
    // key retain their positions. Only the SQL predicate is fully deduplicated.
    const requestedKeys = [...new Set(args.keys)]
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean);
    if (requestedKeys.length === 0) return [];
    const predicateKeys = [...new Set(requestedKeys)];
    const postgresDb = ctx.db as typeof ctx.db & {
      getPublicArtistTaxonomyByKeys: (
        requestedKeys: readonly string[],
      ) => Promise<Array<
        Pick<
          Doc<"replicationArtistTaxonomy">,
          "key" | "primary_type" | "artist_type_tags"
        >
      >>;
    };
    // The native projection reads only public fields, never private evidence.
    const matches = await postgresDb.getPublicArtistTaxonomyByKeys(predicateKeys);
    const byKey = new Map<string, (typeof matches)[number]>();
    for (const row of matches) {
      if (byKey.has(row.key)) throw new Error("Duplicate artist taxonomy key.");
      byKey.set(row.key, row);
    }
    const rows = [];
    for (const key of requestedKeys) {
      const row = byKey.get(key);
      if (row) {
        rows.push({
          key: row.key,
          primary_type: row.primary_type,
          artist_type_tags: row.artist_type_tags,
        });
      }
    }
    return rows;
  },
});

export const applyBatch = mutation({
  args: {
    apiKey: v.optional(v.string()),
    operation_id: v.string(),
    replications: v.array(replicationTaxonomyUpdateValidator),
    artists: v.array(replicationArtistTaxonomyUpdateValidator),
  },
  returns: v.object({
    replication_rows: v.number(),
    evidence_rows: v.number(),
    artist_rows: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "replicationMaintenance" },
      "admin",
    );
    if (args.replications.length + args.artists.length === 0) {
      throw new Error("A taxonomy batch needs at least one update.");
    }
    if (args.replications.length + args.artists.length > 50) {
      throw new Error("A taxonomy batch may contain at most 50 updates.");
    }

    let evidenceRows = 0;
    for (const update of args.replications) {
      const row = await ctx.db.get(update.id);
      if (!row) throw new Error(`Replication ${update.id} no longer exists.`);
      const currentDigest = row.taxonomy_source_digest ?? null;
      const expected = update.expected;
      if (
        !replicationTaxonomyLocatorMatches(row, expected) ||
        row.slug !== expected.slug ||
        row.title !== expected.title ||
        row.artist !== expected.artist ||
        row.type !== expected.type ||
        currentDigest !== expected.taxonomy_source_digest
      ) {
        throw new Error(`Replication ${row.slug} changed after taxonomy preflight.`);
      }

      if (update.taxonomy.source_catalog_id) {
        const claimed = await ctx.db
          .query("replications")
          .withIndex("by_source_catalog_id", (q) =>
            q.eq("source_catalog_id", update.taxonomy.source_catalog_id),
          )
          .unique();
        if (claimed && claimed._id !== update.id) {
          throw new Error(
            `Catalog ID ${update.taxonomy.source_catalog_id} is already attached to ${claimed.slug}.`,
          );
        }
      }

      const claimedRecordKey = await ctx.db
        .query("replications")
        .withIndex("by_taxonomy_record_key", (q) =>
          q.eq("taxonomy_record_key", update.taxonomy.taxonomy_record_key),
        )
        .unique();
      if (claimedRecordKey && claimedRecordKey._id !== update.id) {
        throw new Error(
          `Taxonomy record key ${update.taxonomy.taxonomy_record_key} is already attached to ${claimedRecordKey.slug}.`,
        );
      }

      await ctx.db.patch(update.id, {
        ...update.taxonomy,
        viewing_mode: update.taxonomy.viewing_mode ?? undefined,
        viewing_mode_tags: update.taxonomy.viewing_mode_tags ?? undefined,
        viewing_mode_confidence: update.taxonomy.viewing_mode_confidence ?? undefined,
        viewing_mode_review_required:
          update.taxonomy.viewing_mode_review_required ?? undefined,
        title_drugs: update.taxonomy.title_drugs ?? undefined,
        title_class_mentions: update.taxonomy.title_class_mentions ?? undefined,
        drug_classes: update.taxonomy.drug_classes ?? undefined,
        content_family: update.taxonomy.content_family,
        content_tags: update.taxonomy.content_tags,
        content_family_confidence: update.taxonomy.content_family_confidence,
        content_family_review_required:
          update.taxonomy.content_family_review_required,
      });

      const evidence = {
        replication_id: update.id,
        ...(update.taxonomy.source_catalog_id
          ? { source_catalog_id: update.taxonomy.source_catalog_id }
          : {}),
        taxonomy_record_key: update.taxonomy.taxonomy_record_key,
        replication_status: update.taxonomy.replication_status,
        replication_status_confidence: update.taxonomy.replication_status_confidence,
        replication_status_rationale: update.evidence.replication_status_rationale,
        ...(update.taxonomy.viewing_mode
          ? { viewing_mode: update.taxonomy.viewing_mode }
          : {}),
        ...(update.taxonomy.viewing_mode_confidence
          ? { viewing_mode_confidence: update.taxonomy.viewing_mode_confidence }
          : {}),
        ...(update.evidence.viewing_mode_rationale
          ? { viewing_mode_rationale: update.evidence.viewing_mode_rationale }
          : {}),
        content_family: update.taxonomy.content_family,
        content_tags: update.taxonomy.content_tags,
        content_family_confidence: update.taxonomy.content_family_confidence,
        content_family_rationale: update.evidence.content_family_rationale,
        review_required: update.taxonomy.taxonomy_review_required,
        taxonomy_version: update.taxonomy.taxonomy_version,
        taxonomy_source_digest: update.taxonomy.taxonomy_source_digest,
        operation_id: args.operation_id,
        imported_at: update.taxonomy.taxonomy_updated_at,
      };
      const existingEvidence = await ctx.db
        .query("replicationTaxonomyEvidence")
        .withIndex("by_replication_digest", (q) =>
          q
            .eq("replication_id", update.id)
            .eq("taxonomy_source_digest", update.taxonomy.taxonomy_source_digest),
        )
        .unique();
      if (existingEvidence) await ctx.db.replace(existingEvidence._id, evidence);
      else await ctx.db.insert("replicationTaxonomyEvidence", evidence);
      evidenceRows += 1;
    }

    for (const update of args.artists) {
      const key = update.key.trim().toLowerCase();
      if (!key) throw new Error("Artist taxonomy keys may not be blank.");
      const existing = await ctx.db
        .query("replicationArtistTaxonomy")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if ((existing?.taxonomy_source_digest ?? null) !== update.expected_source_digest) {
        throw new Error(`Artist taxonomy ${key} changed after preflight.`);
      }
      const value = {
        key,
        display_name: update.display_name.trim(),
        primary_type: update.primary_type,
        artist_type_tags: update.artist_type_tags,
        confidence: update.confidence,
        rationale: update.rationale,
        review_required: update.review_required,
        classification_review_count: update.classification_review_count,
        ...(update.classification_review_agreement !== undefined
          ? { classification_review_agreement: update.classification_review_agreement }
          : {}),
        replication_count: update.replication_count,
        taxonomy_version: update.taxonomy_version,
        taxonomy_source_digest: update.taxonomy_source_digest,
        operation_id: args.operation_id,
        imported_at: update.imported_at,
      };
      if (existing) await ctx.db.replace(existing._id, value);
      else await ctx.db.insert("replicationArtistTaxonomy", value);
    }

    return {
      replication_rows: args.replications.length,
      evidence_rows: evidenceRows,
      artist_rows: args.artists.length,
    };
  },
});
