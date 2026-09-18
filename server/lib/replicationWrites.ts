import { PostgresError } from "../../lib/postgres/runtime/values";
import { replicationRevision } from "./replicationEditJournal";
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server";
import type { Id } from "../../lib/postgres/runtime/dataModel";
import { requireRole } from "./auth";
import {
  assertEffectExists,
  KEBAB_CASE,
  normalizeEffectTags,
} from "./replicationPolicy";
import { isPlaceholderStorageId, isValidR2Key } from "./replicationUrls";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import { assertMediaPublicationReceipt, type R2MediaObject } from "../../lib/runtime/r2MediaStorage";
import { REPLICATION_MEDIA_KEY_FIELDS } from "../../lib/runtime/replicationMediaIdentity.mjs";
import type {
  BulkImportArgs,
  DeleteBySlugArgs,
  InsertMediaAssetArgs,
  InsertReplicationArgs,
  RenameSlugArgs,
  SetAudioPresenceArgs,
  UpdateDeliveredFileSizeArgs,
  UpdateEffectSlugArgs,
  UpdateGalleryOrderArgs,
  UpdateStorageIdsArgs,
  UpdateUrlArgs,
} from "./replicationValidators";

const INSERT_MEDIA_ASSET_FIELDS = [
  "slug",
  "title",
  "artist",
  "artist_url",
  "role",
  "type",
  "storage_id",
  "r2_key",
  "thumbnail_r2_key",
  "preview_r2_key",
  "motion_r2_key",
  "motion_poster_r2_key",
  "effect_slug",
  "thumbnail_storage_id",
  "url",
  "thumbnail_url",
  "width",
  "height",
  "format",
  "file_size",
  "duration",
  "has_audio",
  "effect_tags",
  "source_sha256",
  "rights_status",
  "license_name",
  "license_url",
  "credit_line",
  "source_url",
  "rightsholder",
  "permission_notes",
  "removal_contact",
  "source_catalog_id",
  "taxonomy_record_key",
  "replication_status",
  "replication_status_confidence",
  "replication_status_review_required",
  "viewing_mode",
  "viewing_mode_tags",
  "viewing_mode_confidence",
  "viewing_mode_review_required",
  "title_drugs",
  "title_class_mentions",
  "drug_classes",
  "content_family",
  "content_tags",
  "content_family_confidence",
  "content_family_review_required",
  "taxonomy_review_required",
  "taxonomy_version",
  "taxonomy_source_digest",
  "taxonomy_updated_at",
] as const;

function insertMediaAssetRowsAgree(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>,
) {
  return INSERT_MEDIA_ASSET_FIELDS.every(
    (field) => JSON.stringify(existing[field]) === JSON.stringify(proposed[field]),
  );
}

const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_R2_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_R2_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

function r2Extension(key: string) {
  return key.slice(key.lastIndexOf(".") + 1);
}

function sameStrings(actual: readonly string[] | undefined, expected: readonly string[]) {
  const normalized = [...new Set(actual ?? [])].sort();
  return normalized.length === expected.length
    && normalized.every((value, index) => value === expected[index]);
}

function validateTaxonomyCoherence(
  slug: string,
  role: "replication" | "figure",
  taxonomy: InsertMediaAssetArgs["taxonomy"],
) {
  if (!taxonomy) return;
  if (!taxonomy.taxonomy_record_key.trim()) {
    throw new Error(`Media asset ${slug} needs a non-blank taxonomy_record_key.`);
  }
  if (taxonomy.source_catalog_id !== undefined && !taxonomy.source_catalog_id.trim()) {
    throw new Error(`Media asset ${slug} has a blank source_catalog_id.`);
  }
  if (!SHA256.test(taxonomy.taxonomy_source_digest)) {
    throw new Error(`Media asset ${slug} has an invalid taxonomy_source_digest.`);
  }
  if (!Number.isInteger(taxonomy.taxonomy_version) || taxonomy.taxonomy_version <= 0) {
    throw new Error(`Media asset ${slug} has an invalid taxonomy_version.`);
  }
  if (!Number.isFinite(taxonomy.taxonomy_updated_at) || taxonomy.taxonomy_updated_at <= 0) {
    throw new Error(`Media asset ${slug} has an invalid taxonomy_updated_at.`);
  }

  if (taxonomy.viewing_mode === undefined) {
    if (
      (taxonomy.viewing_mode_tags?.length ?? 0) > 0
      || taxonomy.viewing_mode_confidence !== undefined
      || taxonomy.viewing_mode_review_required !== undefined
    ) {
      throw new Error(`Media asset ${slug} has viewing-mode details without viewing_mode.`);
    }
  } else {
    if (
      taxonomy.viewing_mode_confidence === undefined
      || taxonomy.viewing_mode_review_required === undefined
    ) {
      throw new Error(`Media asset ${slug} has an incomplete viewing-mode review.`);
    }
    const expectedTags = taxonomy.viewing_mode === "mixed"
      ? ["closed-eye", "open-eye"]
      : taxonomy.viewing_mode === "uncertain"
        ? []
        : [taxonomy.viewing_mode];
    if (!sameStrings(taxonomy.viewing_mode_tags, expectedTags)) {
      throw new Error(
        `Media asset ${slug} viewing_mode_tags do not match ${taxonomy.viewing_mode}.`,
      );
    }
  }

  const drugClasses = new Set(taxonomy.drug_classes ?? []);
  for (const drug of taxonomy.title_drugs ?? []) {
    if (!KEBAB_CASE.test(drug.slug) || !drug.name.trim() || !drug.matched_title_text.trim()) {
      throw new Error(`Media asset ${slug} has invalid title-drug evidence.`);
    }
    if (!drugClasses.has(drug.class)) {
      throw new Error(
        `Media asset ${slug} title drug class ${drug.class} is absent from drug_classes.`,
      );
    }
  }
  for (const mention of taxonomy.title_class_mentions ?? []) {
    if (!mention.matched_title_text.trim() || !drugClasses.has(mention.class)) {
      throw new Error(`Media asset ${slug} has incoherent title-class evidence.`);
    }
  }

  if (
    role === "figure"
    && (
      taxonomy.replication_status !== "not-replication"
      || taxonomy.content_family !== "explanatory-figure"
    )
  ) {
    throw new Error(
      `Media asset ${slug} is a figure and needs not-replication/explanatory-figure taxonomy.`,
    );
  }
}

function validateTaxonomyEvidence(
  slug: string,
  taxonomy: InsertMediaAssetArgs["taxonomy"],
  evidence: InsertMediaAssetArgs["taxonomy_evidence"],
) {
  if ((taxonomy === undefined) !== (evidence === undefined)) {
    throw new Error(
      `Media asset ${slug} must provide taxonomy and taxonomy_evidence together.`,
    );
  }
  if (!evidence) return;
  if (
    !evidence.operation_id.trim()
    || !evidence.replication_status_rationale.trim()
    || !evidence.content_family_rationale.trim()
  ) {
    throw new Error(`Media asset ${slug} has incomplete taxonomy_evidence.`);
  }
}

function taxonomyEvidenceRecord(
  replicationId: Id<"replications">,
  taxonomy: NonNullable<InsertMediaAssetArgs["taxonomy"]>,
  evidence: NonNullable<InsertMediaAssetArgs["taxonomy_evidence"]>,
) {
  return {
    replication_id: replicationId,
    ...(taxonomy.source_catalog_id
      ? { source_catalog_id: taxonomy.source_catalog_id }
      : {}),
    taxonomy_record_key: taxonomy.taxonomy_record_key,
    replication_status: taxonomy.replication_status,
    replication_status_confidence: taxonomy.replication_status_confidence,
    replication_status_rationale: evidence.replication_status_rationale,
    ...(taxonomy.viewing_mode ? { viewing_mode: taxonomy.viewing_mode } : {}),
    ...(taxonomy.viewing_mode_confidence
      ? { viewing_mode_confidence: taxonomy.viewing_mode_confidence }
      : {}),
    ...(evidence.viewing_mode_rationale
      ? { viewing_mode_rationale: evidence.viewing_mode_rationale }
      : {}),
    content_family: taxonomy.content_family,
    content_tags: taxonomy.content_tags,
    content_family_confidence: taxonomy.content_family_confidence,
    content_family_rationale: evidence.content_family_rationale,
    review_required: taxonomy.taxonomy_review_required,
    taxonomy_version: taxonomy.taxonomy_version,
    taxonomy_source_digest: taxonomy.taxonomy_source_digest,
    operation_id: evidence.operation_id,
    imported_at: taxonomy.taxonomy_updated_at,
  };
}

async function ensureTaxonomyEvidence(
  ctx: MutationCtx,
  replicationId: Id<"replications">,
  taxonomy: NonNullable<InsertMediaAssetArgs["taxonomy"]>,
  evidence: NonNullable<InsertMediaAssetArgs["taxonomy_evidence"]>,
) {
  const expected = taxonomyEvidenceRecord(replicationId, taxonomy, evidence);
  const existing = await ctx.db
    .query("replicationTaxonomyEvidence")
    .withIndex("by_replication_digest", (q) =>
      q
        .eq("replication_id", replicationId)
        .eq("taxonomy_source_digest", taxonomy.taxonomy_source_digest),
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("replicationTaxonomyEvidence", expected);
    return;
  }
  const agrees = Object.entries(expected).every(
    ([field, value]) => JSON.stringify(existing[field as keyof typeof existing])
      === JSON.stringify(value),
  );
  if (!agrees) {
    throw new Error(`Taxonomy evidence for ${taxonomy.taxonomy_record_key} has drifted.`);
  }
}

function validHttpUrl(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function validateRightsCoherence(
  slug: string,
  rights: Pick<
    InsertMediaAssetArgs,
    | "rights_status"
    | "license_name"
    | "license_url"
    | "permission_notes"
    | "source_url"
  >,
) {
  const hasLicenseName = Boolean(rights.license_name?.trim());
  const hasLicenseUrl = validHttpUrl(rights.license_url);
  if (rights.rights_status === "explicit-license") {
    if (!hasLicenseName || !hasLicenseUrl) {
      throw new Error(
        `Media asset ${slug} explicit-license rights need license_name and license_url.`,
      );
    }
  } else if (hasLicenseName || rights.license_url !== undefined) {
    throw new Error(
      `Media asset ${slug} has license metadata without explicit-license rights.`,
    );
  }
  if (
    rights.rights_status === "permission-granted"
    && !rights.permission_notes?.trim()
  ) {
    throw new Error(
      `Media asset ${slug} permission-granted rights need permission_notes.`,
    );
  }
  if (
    rights.rights_status === "public-domain"
    && (!validHttpUrl(rights.source_url) || !rights.permission_notes?.trim())
  ) {
    throw new Error(
      `Media asset ${slug} public-domain rights need source_url and permission_notes.`,
    );
  }
}

export async function authorizeMediaUploadHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string },
) {
  assertDataWritesNotFrozen("replication-media.upload");
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  if (!ctx.targetIdentity) throw new Error("Media upload requires an explicit Postgres target.");
  return { actorEmail: actor.email, targetIdentity: ctx.targetIdentity };
}

export function verifyMediaPublicationReceipts(
  row: { type: string; format: string },
  keys: Partial<Record<"r2_key" | "thumbnail_r2_key" | "preview_r2_key" | "motion_r2_key" | "motion_poster_r2_key", string>>,
  receipts: Record<string, string> | undefined,
  binding: { purpose: "replication-rendition" | "replication-import"; subject: string; actorEmail: string; targetIdentity: string },
) {
  const objects = new Map<string, R2MediaObject>();
  for (const field of REPLICATION_MEDIA_KEY_FIELDS as Array<keyof typeof keys>) {
    const key = keys[field];
    if (key === undefined) continue;
    if (!isValidR2Key(key)) throw new Error(`Invalid ${field}.`);
    const object = assertMediaPublicationReceipt(receipts?.[field] ?? "", key, binding);
    const extension = r2Extension(key);
    if (field === "r2_key" && !object.mimeType.startsWith(`${row.type}/`)) {
      throw new Error("Main media type does not match the replication.");
    }
    if ((field === "thumbnail_r2_key" || field === "motion_poster_r2_key")
      && (!IMAGE_R2_EXTENSIONS.has(extension) || !object.mimeType.startsWith("image/"))) {
      throw new Error("Poster renditions must be images.");
    }
    if ((field === "preview_r2_key" || field === "motion_r2_key")
      && (!VIDEO_R2_EXTENSIONS.has(extension) || !object.mimeType.startsWith("video/"))) {
      throw new Error("Playback renditions must be videos.");
    }
    if (field === "preview_r2_key" && row.type !== "video") throw new Error("Only video rows support previews.");
    if ((field === "motion_r2_key" || field === "motion_poster_r2_key")
      && (row.type !== "image" || row.format !== "gif")) throw new Error("Only GIF rows support motion renditions.");
    objects.set(field, object);
  }
  return objects;
}

export async function insertReplicationHandler(
  ctx: MutationCtx,
  args: InsertReplicationArgs,
) {
  const result = await insertMediaAssetHandler(ctx, {
    ...args,
    expected_absent: true,
    role: "replication",
    rights_status: args.rights_status ?? "unknown",
  });
  return result.id;
}

export async function insertMediaAssetHandler(
  ctx: MutationCtx,
  args: InsertMediaAssetArgs,
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const {
    apiKey: _apiKey,
    actorEmail: _actorEmail,
    mediaReceipts,
    expected_absent: _expectedAbsent,
    taxonomy,
    taxonomy_evidence: taxonomyEvidence,
    ...row
  } = args;

  if (!KEBAB_CASE.test(row.slug)) {
    throw new Error(`Media asset slug is not kebab-case: ${row.slug}`);
  }
  if (row.title.trim().length === 0 || row.artist.trim().length === 0) {
    throw new Error(`Media asset ${row.slug} needs a non-blank title and artist.`);
  }

  const hasR2Key = isValidR2Key(row.r2_key);
  const hasNativeStorage = !isPlaceholderStorageId(row.storage_id)
    && Boolean(row.storage_id?.trim());
  const hasDirectUrl = validHttpUrl(row.url);
  if (row.r2_key !== undefined && !hasR2Key) {
    throw new Error(`Media asset ${row.slug} has an invalid r2_key: ${row.r2_key}`);
  }
  for (const field of [
    "thumbnail_r2_key",
    "preview_r2_key",
    "motion_r2_key",
    "motion_poster_r2_key",
  ] as const) {
    const key = row[field];
    if (key !== undefined && !isValidR2Key(key)) {
      throw new Error(`Media asset ${row.slug} has an invalid ${field}: ${key}`);
    }
  }
  if ((row.motion_r2_key === undefined) !== (row.motion_poster_r2_key === undefined)) {
    throw new Error(`Media asset ${row.slug} needs motion and motion-poster R2 keys together.`);
  }
  if (row.preview_r2_key !== undefined && row.type !== "video") {
    throw new Error(`Media asset ${row.slug} preview_r2_key is only valid for video.`);
  }
  if (
    (row.motion_r2_key !== undefined || row.motion_poster_r2_key !== undefined)
    && (row.type !== "image" || row.format !== "gif")
  ) {
    throw new Error(`Media asset ${row.slug} motion R2 keys are only valid for GIF images.`);
  }
  for (const field of ["thumbnail_r2_key", "motion_poster_r2_key"] as const) {
    const key = row[field];
    if (key !== undefined && !IMAGE_R2_EXTENSIONS.has(r2Extension(key))) {
      throw new Error(`Media asset ${row.slug} ${field} must use an image extension.`);
    }
  }
  for (const field of ["preview_r2_key", "motion_r2_key"] as const) {
    const key = row[field];
    if (key !== undefined && !VIDEO_R2_EXTENSIONS.has(r2Extension(key))) {
      throw new Error(`Media asset ${row.slug} ${field} must use a video extension.`);
    }
  }
  if (row.url !== undefined && !hasDirectUrl) {
    throw new Error(`Media asset ${row.slug} has an invalid direct url: ${row.url}`);
  }
  if (!hasR2Key && !hasNativeStorage && !hasDirectUrl) {
    throw new Error(
      `Media asset ${row.slug} has no real r2_key, storage_id, or url.`,
    );
  }
  if (row.format !== row.format.trim().toLowerCase() || row.format.length === 0) {
    throw new Error(`Media asset ${row.slug} format must be lowercase and non-blank.`);
  }
  if (row.format.startsWith(".")) {
    throw new Error(
      `Media asset ${row.slug} format must omit the leading dot: ${row.format}`,
    );
  }

  const effectTags = row.effect_tags
    ? normalizeEffectTags(row.effect_tags)
    : undefined;
  if (row.effect_slug !== undefined) {
    await assertEffectExists(ctx, row.effect_slug, `Media asset ${row.slug}`);
  }
  for (const tag of effectTags ?? []) {
    if (tag !== row.effect_slug) {
      await assertEffectExists(ctx, tag, `Media asset ${row.slug}`);
    }
  }

  for (const [key, value] of [
    ["width", row.width],
    ["height", row.height],
    ["file_size", row.file_size],
    ["duration", row.duration],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`Media asset ${row.slug} has a non-positive ${key}: ${value}`);
    }
  }
  if ((row.width === undefined) !== (row.height === undefined)) {
    throw new Error(`Media asset ${row.slug} needs width and height together.`);
  }
  for (const [key, value] of [
    ["width", row.width],
    ["height", row.height],
    ["file_size", row.file_size],
  ] as const) {
    if (value !== undefined && !Number.isInteger(value)) {
      throw new Error(`Media asset ${row.slug} has a non-integer ${key}: ${value}`);
    }
  }
  if (row.type === "image" && row.duration !== undefined) {
    throw new Error(`Media asset ${row.slug} is an image and cannot have a duration.`);
  }
  if (row.type !== "video" && row.has_audio !== undefined) {
    throw new Error(`Media asset ${row.slug} is not a video and cannot set has_audio.`);
  }
  if (row.source_sha256 !== undefined && !SHA256.test(row.source_sha256)) {
    throw new Error(`Media asset ${row.slug} has an invalid source_sha256.`);
  }
  validateRightsCoherence(row.slug, row);
  validateTaxonomyCoherence(row.slug, row.role, taxonomy);
  validateTaxonomyEvidence(row.slug, taxonomy, taxonomyEvidence);
  if (REPLICATION_MEDIA_KEY_FIELDS.some((field) => row[field as keyof typeof row] !== undefined)) {
    if (!ctx.targetIdentity) throw new Error("Media publication requires an explicit Postgres target.");
    const objects = verifyMediaPublicationReceipts(row, row, mediaReceipts, {
      purpose: "replication-import", subject: row.slug, actorEmail: actor.email, targetIdentity: ctx.targetIdentity,
    });
    const main = objects.get("r2_key");
    if (main && row.file_size !== undefined && row.file_size !== main.fileSize) {
      throw new Error("Declared file_size does not match the verified media.");
    }
    if (main) row.file_size = main.fileSize;
  }

  const proposed = {
    ...row,
    effect_tags: effectTags && effectTags.length > 0 ? effectTags : undefined,
    ...(taxonomy ?? {}),
  };
  const collision = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", row.slug))
    .first();

  if (row.source_sha256) {
    const claimed = await ctx.db
      .query("replications")
      .withIndex("by_source_sha256", (q) =>
        q.eq("source_sha256", row.source_sha256),
      )
      .unique();
    if (claimed && claimed._id !== collision?._id) {
      throw new Error(
        `Source SHA-256 ${row.source_sha256} is already attached to ${claimed.slug}.`,
      );
    }
  }
  if (taxonomy?.source_catalog_id) {
    const claimed = await ctx.db
      .query("replications")
      .withIndex("by_source_catalog_id", (q) =>
        q.eq("source_catalog_id", taxonomy.source_catalog_id),
      )
      .unique();
    if (claimed && claimed._id !== collision?._id) {
      throw new Error(
        `Catalog ID ${taxonomy.source_catalog_id} is already attached to ${claimed.slug}.`,
      );
    }
  }
  if (taxonomy?.taxonomy_record_key) {
    const claimed = await ctx.db
      .query("replications")
      .withIndex("by_taxonomy_record_key", (q) =>
        q.eq("taxonomy_record_key", taxonomy.taxonomy_record_key),
      )
      .unique();
    if (claimed && claimed._id !== collision?._id) {
      throw new Error(
        `Taxonomy record key ${taxonomy.taxonomy_record_key} is already attached to ${claimed.slug}.`,
      );
    }
  }
  if (collision) {
    if (insertMediaAssetRowsAgree(collision, proposed)) {
      if (taxonomy && taxonomyEvidence) {
        await ensureTaxonomyEvidence(ctx, collision._id, taxonomy, taxonomyEvidence);
      }
      return {
        inserted: false,
        id: collision._id,
        slug: collision.slug,
        role: collision.role ?? "replication",
      };
    }
    throw new Error(`Media asset slug already in use: ${row.slug} (${collision._id}).`);
  }

  const id = await ctx.db.insert("replications", {
    ...proposed,
    created_at: new Date().toISOString(),
  });
  if (taxonomy && taxonomyEvidence) {
    await ensureTaxonomyEvidence(ctx, id, taxonomy, taxonomyEvidence);
  }
  return { inserted: true, id, slug: row.slug, role: row.role };
}

export async function bulkImportHandler(ctx: MutationCtx, args: BulkImportArgs) {
  const results = { created: 0, updated: 0, errors: [] as string[] };
  for (const replication of args.replications) {
    try {
      const existing = await ctx.db
        .query("replications")
        .withIndex("by_slug", (q) => q.eq("slug", replication.slug))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          ...replication,
          created_at: existing.created_at,
        });
        results.updated++;
      } else {
        await ctx.db.insert("replications", {
          ...replication,
          created_at: new Date().toISOString(),
        });
        results.created++;
      }
    } catch (error) {
      results.errors.push(
        `Failed to import ${replication.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return results;
}

export async function updateGalleryOrderHandler(
  ctx: MutationCtx,
  args: UpdateGalleryOrderArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const effect = await ctx.db
    .query("subjectiveEffects")
    .withIndex("by_slug", (q) => q.eq("slug", args.effect_slug))
    .first();
  if (!effect) throw new Error(`Effect not found: ${args.effect_slug}`);
  if (await replicationRevision(ctx, effect, `effect:${args.effect_slug}`) !== args.expectedRevision) throw new PostgresError({ code: "CONFLICT", message: "This collection changed. Reload its stored order before saving." });
  if (
    args.expected_replication_slugs !== undefined &&
    JSON.stringify(effect.gallery_order ?? []) !==
      JSON.stringify(args.expected_replication_slugs)
  ) {
    return {
      status: "conflict" as const,
      server: effect.gallery_order ?? [],
    };
  }

  await ctx.db.patch(effect._id, { gallery_order: args.replication_slugs });
  return { status: "ok" as const };
}

export async function renameSlugHandler(ctx: MutationCtx, args: RenameSlugArgs) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  if (args.from === args.to) {
    return { success: true, renamed: false, galleryOrdersPatched: 0 };
  }
  if (!KEBAB_CASE.test(args.to)) {
    throw new Error(`Target slug is not kebab-case: ${args.to}`);
  }

  const replication = args.id
    ? await ctx.db.get(args.id)
    : await ctx.db
        .query("replications")
        .withIndex("by_slug", (q) => q.eq("slug", args.from))
        .first();
  if (!replication) throw new Error(`Replication not found: ${args.id ?? args.from}`);
  if (replication.slug !== args.from) {
    throw new Error(
      `Replication ${replication._id} holds slug ${replication.slug}, not ${args.from}`,
    );
  }

  const collision = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.to))
    .first();
  if (collision) throw new Error(`Target slug already in use: ${args.to}`);

  await ctx.db.patch(replication._id, { slug: args.to });
  const effects = await ctx.db.query("subjectiveEffects").collect();
  let galleryOrdersPatched = 0;
  for (const effect of effects) {
    if (!effect.gallery_order?.includes(args.from)) continue;
    await ctx.db.patch(effect._id, {
      gallery_order: effect.gallery_order.map((slug) =>
        slug === args.from ? args.to : slug,
      ),
    });
    galleryOrdersPatched += 1;
  }
  return { success: true, renamed: true, galleryOrdersPatched };
}

export async function deleteBySlugHandler(
  ctx: MutationCtx,
  args: DeleteBySlugArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const replication = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .first();
  if (!replication) throw new Error(`Replication not found: ${args.slug}`);

  await ctx.db.delete(replication._id);
  return { success: true };
}


export async function updateEffectSlugHandler(
  ctx: MutationCtx,
  args: UpdateEffectSlugArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const replication = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .first();
  if (!replication) throw new Error(`Replication not found: ${args.slug}`);

  await ctx.db.patch(replication._id, { effect_slug: args.effect_slug });
  return { success: true };
}

export async function updateUrlHandler(ctx: MutationCtx, args: UpdateUrlArgs) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const updates: { url: string; thumbnail_url?: string } = { url: args.url };
  if (args.thumbnail_url) updates.thumbnail_url = args.thumbnail_url;
  await ctx.db.patch(args.id, updates);
  return { success: true };
}

export async function updateDeliveredFileSizeHandler(
  ctx: MutationCtx,
  args: UpdateDeliveredFileSizeArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  if (!Number.isFinite(args.file_size) || args.file_size <= 0) {
    throw new Error("file_size must be a positive number of bytes.");
  }

  const replication = await ctx.db.get(args.id);
  if (!replication) throw new Error(`Replication ${args.id} not found.`);
  if (replication.storage_id !== args.expectedStorageId) {
    throw new Error(
      `Replication ${replication.slug} has been repointed since it was measured `
        + `(expected storage ${args.expectedStorageId}, found ${replication.storage_id}).`,
    );
  }

  const previous = replication.file_size ?? null;
  await ctx.db.patch(args.id, { file_size: args.file_size });
  return { success: true, slug: replication.slug, previous, current: args.file_size };
}

const AUDIO_PRESENCE_BATCH_LIMIT = 250;

export async function setAudioPresenceHandler(
  ctx: MutationCtx,
  args: SetAudioPresenceArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  if (args.entries.length === 0) {
    throw new Error("setAudioPresence needs at least one entry.");
  }
  if (args.entries.length > AUDIO_PRESENCE_BATCH_LIMIT) {
    throw new Error(
      `setAudioPresence may touch at most ${AUDIO_PRESENCE_BATCH_LIMIT} rows `
        + `per call (got ${args.entries.length}).`,
    );
  }

  const updatedSlugs: string[] = [];
  for (const entry of args.entries) {
    const row = await ctx.db.get(entry.id);
    if (!row) throw new Error(`Replication ${entry.id} not found.`);
    await ctx.db.patch(entry.id, { has_audio: entry.has_audio });
    updatedSlugs.push(row.slug);
  }
  return { success: true, updated: updatedSlugs.length, slugs: updatedSlugs };
}

export async function updateStorageIdsHandler(
  ctx: MutationCtx,
  args: UpdateStorageIdsArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const updates: { storage_id: string; thumbnail_storage_id?: string } = {
    storage_id: args.storage_id,
  };
  if (args.thumbnail_storage_id) {
    updates.thumbnail_storage_id = args.thumbnail_storage_id;
  }
  await ctx.db.patch(args.id, updates);
  return { success: true };
}

export async function deleteAllHandler(ctx: MutationCtx) {
  const replications = await ctx.db.query("replications").collect();
  for (const replication of replications) {
    await ctx.db.delete(replication._id);
  }
  return { deleted: replications.length };
}
