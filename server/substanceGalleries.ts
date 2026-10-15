import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { replicationRevision } from "./lib/replicationEditJournal";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replications";
import {
  replicationMediaType,
  replicationRole,
  storedReplication,
} from "./lib/replicationValidators";
import {
  replicationStatusValidator,
  titleClassMentionValidator,
  titleDrugValidator,
} from "./lib/replicationTaxonomyValidators";
import {
  countSubstanceGalleryMatches,
  directGalleryAssociationProvenance,
  isCombinationReplication,
  matchSubstanceGalleryReplications,
  substanceGalleryMatchDigest,
  includeDirectlyAssociatedRows,
  normalizeGalleryCarouselOrder,
  normalizeGalleryCuration,
  substanceGalleryTargetOf,
  type SubstanceGalleryMatchableRow,
  type SubstanceGalleryMatchProvenance,
  isShowcaseEligible,
  GALLERY_CURATION_SLUG_CAP,
} from "../src/data/substanceReplicationGallery";
import type { ReplicationAssociation } from "../src/features/dev/tools/replication-studio/replicationAssociationModel";
import { getPublicGalleryBySubstanceHandler, getSubstanceGalleryMembers } from "./lib/substanceGalleryPublicReads";
import { getCurationDetailHandler, uniqueSubstanceBySlug } from "./lib/substanceGalleryCurationReads";
import { resolvedReplication } from "./lib/replicationValidators";
import { galleryMatchProjection } from "./lib/publicReadIndexes";

const MAX_GALLERY_CURATION_SLUGS = GALLERY_CURATION_SLUG_CAP;

const PUBLIC_SUBSTANCE_GALLERY_PAGE_SIZE = 64;

const substanceGalleryProvenanceValidator = v.object({
  matchedVia: v.union(
    v.literal("specific_drug"),
    v.literal("drug_class"),
    v.literal("visual_disconnection"),
    v.literal("curated"),
  ),
  effectSlug: v.string(),
  substanceSlug: v.optional(v.string()),
  drugClass: v.optional(
    v.union(v.literal("dissociatives"), v.literal("deliriants")),
  ),
});

const publicSubstanceGalleryCurationValidator = v.union(
  v.object({
    curated_slugs: v.array(v.string()),
    removed_slugs: v.array(v.string()),
    carousel_order: v.array(v.string()),
    disabled: v.optional(v.boolean()),
  }),
  v.null(),
);

const publicSubstanceGalleryPageResult = v.object({
  items: v.array(
    v.object({
      replication: v.object({
        ...storedReplication.fields,
        url: v.union(v.string(), v.null()),
        thumbnail_url: v.union(v.string(), v.null()),
      }),
      provenance: substanceGalleryProvenanceValidator,
    }),
  ),
  curation: publicSubstanceGalleryCurationValidator,
  cursor: v.string(),
  isDone: v.boolean(),
});

export function clampPublicSubstanceGalleryPageSize(requested?: number): number {
  const normalized =
    requested !== undefined && Number.isFinite(requested)
      ? Math.floor(requested)
      : PUBLIC_SUBSTANCE_GALLERY_PAGE_SIZE;
  return Math.min(Math.max(normalized, 1), PUBLIC_SUBSTANCE_GALLERY_PAGE_SIZE);
}

export const getBySubstance = query({
  args: { substance_slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();
  },
});

export async function getPublicReplicationsForSubstancePageHandler(
  ctx: QueryCtx,
  args: { substance_slug: string; cursor?: string; limit?: number },
) {
  const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
  if (!substance) {
    return {
      items: [],
      curation: null,
      cursor: args.cursor ?? "",
      isDone: true,
    };
  }

  const gallery = await ctx.db
    .query("substanceGalleries")
    .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
    .first();
  if (gallery?.disabled) {
    return {
      items: [],
      curation: { curated_slugs: gallery.curated_slugs, removed_slugs: gallery.removed_slugs, carousel_order: gallery.carousel_order ?? [], disabled: true },
      cursor: args.cursor ?? "",
      isDone: true,
    };
  }
  const page = await ctx.db.query("replications").paginate({
    cursor: args.cursor ?? null,
    numItems: clampPublicSubstanceGalleryPageSize(args.limit),
  });
  const target = substanceGalleryTargetOf(substance);
  const matches = target
    ? matchSubstanceGalleryReplications(page.page, target).matches
    : [];
  const available = includeDirectlyAssociatedRows(page.page, matches, gallery);

  const urls = memoizedStorageUrls(ctx);
  const items = await Promise.all(
    available.map(async ({ row, provenance }) => {
      const { url, thumbnail_url } = await resolveReplicationUrls(urls, row, {
        preview: false,
      });
      return { replication: { ...row, url, thumbnail_url }, provenance };
    }),
  );

  return {
    items,
    curation: gallery
      ? {
          curated_slugs: gallery.curated_slugs,
          removed_slugs: gallery.removed_slugs,
          carousel_order: gallery.carousel_order ?? [],
          disabled: gallery.disabled ?? false,
        }
      : null,
    cursor: page.continueCursor,
    isDone: page.isDone,
  };
}

export const getPublicReplicationsForSubstance = query({
  args: {
    substance_slug: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: publicSubstanceGalleryPageResult,
  handler: getPublicReplicationsForSubstancePageHandler,
});

const publicMatchableReplicationRow = v.object({
  slug: v.string(),
  title: v.string(),
  type: replicationMediaType,
  role: v.optional(replicationRole),
  effect_slug: v.optional(v.string()),
  title_drugs: v.optional(v.array(titleDrugValidator)),
  title_class_mentions: v.optional(v.array(titleClassMentionValidator)),
  showcase_excluded: v.optional(v.boolean()),
  replication_status: v.optional(replicationStatusValidator),
  publication_state: v.optional(v.union(v.literal("published"), v.literal("unpublished"), v.literal("duplicate-suppressed"))),
});

const PUBLIC_MATCHABLE_REPLICATIONS_PAGE_SIZE = 256;

function clampPublicMatchableReplicationsPageSize(requested?: number): number {
  const normalized =
    requested !== undefined && Number.isFinite(requested)
      ? Math.floor(requested)
      : PUBLIC_MATCHABLE_REPLICATIONS_PAGE_SIZE;
  return Math.min(Math.max(normalized, 1), PUBLIC_MATCHABLE_REPLICATIONS_PAGE_SIZE);
}

export async function getPublicMatchableReplicationsPageHandler(
  ctx: QueryCtx,
  args: { cursor?: string; limit?: number },
) {
  const page = await ctx.db.query("replications").paginate({
    cursor: args.cursor ?? null,
    numItems: clampPublicMatchableReplicationsPageSize(args.limit),
  });
  return {
    items: page.page.map(galleryMatchProjection),
    cursor: page.continueCursor,
    isDone: page.isDone,
  };
}

export const getPublicMatchableReplicationsPage = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(publicMatchableReplicationRow),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: getPublicMatchableReplicationsPageHandler,
});

export const getPublicGalleryBySubstance = query({
  args: { substance_slug: v.string() },
  returns: v.object({
    items: v.array(
      v.object({
        replication: resolvedReplication,
        provenance: substanceGalleryProvenanceValidator,
      }),
    ),
    carouselOrder: v.optional(v.array(v.string())),
  }),
  handler: getPublicGalleryBySubstanceHandler,
});

const CURATION_CANDIDATE_PAGE_SIZE = 32;
const CURATION_CANDIDATE_MAX_PAGE_SIZE = 100;

const curationMatchBucketValidator = v.object({
  route: v.union(v.string(), v.null()),
  drugClass: v.union(v.literal("dissociatives"), v.literal("deliriants"), v.null()),
  visualDisconnection: v.boolean(),
  count: v.number(),
});

export const getCurationMatchDigest = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  returns: v.array(curationMatchBucketValidator),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
      "editor",
    );
    const rows = await ctx.db.query("replications").collect();
    return substanceGalleryMatchDigest(rows);
  },
});

export const listCurationCandidatesPage = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    digest: v.array(curationMatchBucketValidator),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
      "editor",
    );

    const numItems = Math.min(
      Math.max(Math.floor(args.limit ?? CURATION_CANDIDATE_PAGE_SIZE), 1),
      CURATION_CANDIDATE_MAX_PAGE_SIZE,
    );
    const page = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems,
    });

    const items = await Promise.all(
      page.page.map(async (substance) => {
        const target = substanceGalleryTargetOf(substance);
        const gallery = await ctx.db
          .query("substanceGalleries")
          .withIndex("by_substance", (q) => q.eq("substance_slug", substance.slug))
          .first();

        return {
          slug: substance.slug,
          title: substance.title,
          match_count: target ? countSubstanceGalleryMatches(args.digest, target) : 0,
          curated: gallery !== null,
          curated_count: gallery?.curated_slugs.length ?? 0,
          removed_count: gallery?.removed_slugs.length ?? 0,
        };
      }),
    );

    return { items, cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const getCurationDetail = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    substance_slug: v.string(),
  },
  handler: getCurationDetailHandler,
});

export const upsert = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    substance_slug: v.string(),
    curated_slugs: v.array(v.string()),
    removed_slugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
    expectedUpdatedAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    if (args.curated_slugs.length > MAX_GALLERY_CURATION_SLUGS) {
      throw new Error(
        `This gallery curates ${args.curated_slugs.length} works; the limit is ${MAX_GALLERY_CURATION_SLUGS}. Uncurate some rows before saving.`,
      );
    }
    if (args.removed_slugs.length > MAX_GALLERY_CURATION_SLUGS) {
      throw new Error(
        `This gallery excludes ${args.removed_slugs.length} works; the limit is ${MAX_GALLERY_CURATION_SLUGS}. Restore some from the Excluded shelf, or exclude junk everywhere from the Library instead.`,
      );
    }

    const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
    if (!substance) {
      throw new Error(`No substance found for slug "${args.substance_slug}".`);
    }

    const existing = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();

    const expected = args.expectedUpdatedAt;
    if (
      expected !== undefined &&
      (expected === null ? existing !== null : existing?.updated_at !== expected)
    ) {
      return {
        status: "conflict" as const,
        server: {
          curated_slugs: existing?.curated_slugs ?? [],
          removed_slugs: existing?.removed_slugs ?? [],
          carousel_order: existing?.carousel_order ?? [],
          updated_at: existing?.updated_at ?? "",
          updated_by: existing?.updated_by ?? null,
        },
      };
    }

    const rows = await ctx.db.query("replications").collect();
    const target = substanceGalleryTargetOf(substance);
    const matches = target
      ? matchSubstanceGalleryReplications(rows, target).matches
      : [];

    const normalized = normalizeGalleryCuration({
      curatedSlugs: args.curated_slugs,
      removedSlugs: args.removed_slugs,
      matchableSlugs: new Set(matches.map((match) => match.row.slug)),
      curatableSlugs: new Set(
        rows
          .filter((row) => isShowcaseEligible(row) && !isCombinationReplication(row))
          .map((row) => row.slug),
      ),
    });

    const updated_at = new Date().toISOString();
    const updated_by = args.updatedBy ?? actor.email;

    if (existing) {
      await ctx.db.patch(existing._id, {
        curated_slugs: normalized.curatedSlugs,
        removed_slugs: normalized.removedSlugs,
        updated_at,
        updated_by,
      });
    } else {
      await ctx.db.insert("substanceGalleries", {
        substance_slug: args.substance_slug,
        curated_slugs: normalized.curatedSlugs,
        removed_slugs: normalized.removedSlugs,
        carousel_order: [],
        updated_at,
        updated_by,
      });
    }

    return {
      status: "ok" as const,
      updated: Boolean(existing),
      substance_slug: args.substance_slug,
      curated_slugs: normalized.curatedSlugs,
      removed_slugs: normalized.removedSlugs,
      pruned_curated: normalized.prunedCurated,
      pruned_removed: normalized.prunedRemoved,
      updated_at,
      updated_by,
    };
  },
});

export const setCarouselOrder = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    substance_slug: v.string(),
    carousel_order: v.array(v.string()),
    expectedUpdatedAt: v.optional(v.union(v.string(), v.null())),
    expectedCarouselOrder: v.optional(v.array(v.string())),
    expectedRevision: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
    if (!substance) {
      throw new Error(`No substance found for slug "${args.substance_slug}".`);
    }
    const existing = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();
    if (await replicationRevision(ctx, existing, `substance:${args.substance_slug}`) !== args.expectedRevision) throw new PostgresError({ code: "CONFLICT", message: "This collection changed. Reload its stored order before saving." });
    const expected = args.expectedUpdatedAt;
    const staleTimestamp =
      expected !== undefined &&
      (expected === null ? existing !== null : existing?.updated_at !== expected);
    const staleOrder =
      args.expectedCarouselOrder !== undefined &&
      JSON.stringify(existing?.carousel_order ?? []) !==
        JSON.stringify(args.expectedCarouselOrder);
    if (staleTimestamp || staleOrder) {
      return {
        status: "conflict" as const,
        server: {
          carousel_order: existing?.carousel_order ?? [],
          updated_at: existing?.updated_at ?? "",
          updated_by: existing?.updated_by ?? null,
        },
      };
    }

    const included = await getSubstanceGalleryMembers(ctx, substance, existing);
    const normalized = normalizeGalleryCarouselOrder(
      args.carousel_order,
      new Set(included.map((item) => item.row.slug)),
    );
    if (normalized.pruned.length || normalized.order.length !== args.carousel_order.length) {
      throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "Order must contain distinct current showcase members; reload the complete collection before saving." });
    }
    const updated_at = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        carousel_order: normalized.order,
        updated_at,
        updated_by: actor.email,
      });
    } else {
      await ctx.db.insert("substanceGalleries", {
        substance_slug: args.substance_slug,
        curated_slugs: [],
        removed_slugs: [],
        carousel_order: normalized.order,
        updated_at,
        updated_by: actor.email,
      });
    }

    return {
      status: "ok" as const,
      substance_slug: args.substance_slug,
      carousel_order: normalized.order,
      pruned: normalized.pruned,
      updated_at,
      updated_by: actor.email,
    };
  },
});

export const setDisabled = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    substance_slug: v.string(),
    disabled: v.boolean(),
    expectedRevision: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "admin");
    if (!await uniqueSubstanceBySlug(ctx, args.substance_slug)) {
      throw new PostgresError({ code: "COLLECTION_NOT_FOUND", message: "The substance no longer exists." });
    }
    const existing = await ctx.db.query("substanceGalleries")
      .withIndex("by_substance", q => q.eq("substance_slug", args.substance_slug)).first();
    if (await replicationRevision(ctx, existing, `substance:${args.substance_slug}`) !== args.expectedRevision) {
      throw new PostgresError({ code: "CONFLICT", message: "This collection changed. Reload before changing its eligibility." });
    }
    const patch = { disabled: args.disabled, updated_at: new Date().toISOString(), updated_by: actor.email };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("substanceGalleries", { substance_slug: args.substance_slug, curated_slugs: [], removed_slugs: [], carousel_order: [], ...patch });
    return { ok: true, disabled: args.disabled };
  },
});

function associationProvenance(
  replication: SubstanceGalleryMatchableRow,
  substance: unknown,
): SubstanceGalleryMatchProvenance | null {
  const target = substanceGalleryTargetOf(substance);
  if (!target) return null;
  const { matches } = matchSubstanceGalleryReplications([replication], target);
  return matches.length > 0 ? matches[0].provenance : null;
}

export const getReplicationAssociationsPage = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    replicationSlug: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
      "editor",
    );

    const numItems = Math.min(
      Math.max(Math.floor(args.limit ?? CURATION_CANDIDATE_PAGE_SIZE), 1),
      CURATION_CANDIDATE_MAX_PAGE_SIZE,
    );

    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.replicationSlug))
      .first();
    if (!replication || !isShowcaseEligible(replication)) {
      return { items: [], cursor: args.cursor ?? "", isDone: true };
    }

    const page = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems,
    });

    const items: ReplicationAssociation[] = [];
    for (const substance of page.page) {
      const substanceSlug = substance.slug;
      if (!substanceSlug) continue;
      const gallery = await ctx.db
        .query("substanceGalleries")
        .withIndex("by_substance", (q) => q.eq("substance_slug", substanceSlug))
        .first();
      const derivedProvenance = associationProvenance(replication, substance);
      const directProvenance = directGalleryAssociationProvenance(replication, gallery);
      const provenance = derivedProvenance ?? directProvenance;
      if (!provenance) continue;

      const effectName =
        provenance.matchedVia === "specific_drug"
          ? substance.title
          : provenance.matchedVia === "drug_class"
            ? provenance.drugClass ?? provenance.effectSlug
            : provenance.matchedVia === "visual_disconnection"
              ? "Visual Disconnection"
              : provenance.effectSlug;

      const curatedIndex = gallery ? gallery.curated_slugs.indexOf(args.replicationSlug) : -1;

      items.push({
        slug: substanceSlug,
        title: substance.title,
        matchedVia: provenance.matchedVia,
        effectSlug: provenance.effectSlug,
        effectName,
        excluded: gallery ? gallery.removed_slugs.includes(args.replicationSlug) : false,
        curatedPosition: curatedIndex >= 0 ? curatedIndex + 1 : null,
      });
    }

    return { items, cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const setReplicationDirectAssociation = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    replicationSlug: v.string(),
    substanceSlug: v.string(),
    assigned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );
    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.replicationSlug))
      .first();
    if (
      !replication ||
      !isShowcaseEligible(replication) ||
      isCombinationReplication(replication)
    ) {
      throw new Error(
        `Replication "${args.replicationSlug}" cannot be assigned to a single-substance showcase.`,
      );
    }
    const substance = await uniqueSubstanceBySlug(ctx, args.substanceSlug);
    if (!substance) {
      throw new Error(`No substance found for slug "${args.substanceSlug}".`);
    }
    const existing = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substanceSlug))
      .first();
    const current = existing?.curated_slugs ?? [];
    const curated_slugs = args.assigned
      ? current.includes(args.replicationSlug)
        ? current
        : [...current, args.replicationSlug]
      : current.filter((slug) => slug !== args.replicationSlug);
    if (curated_slugs.length > MAX_GALLERY_CURATION_SLUGS) {
      throw new Error(
        `This gallery curates more than ${MAX_GALLERY_CURATION_SLUGS} works.`,
      );
    }
    const removed_slugs = (existing?.removed_slugs ?? []).filter(
      (slug) => slug !== args.replicationSlug,
    );
    const updated_at = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        curated_slugs,
        removed_slugs,
        updated_at,
        updated_by: actor.email,
      });
    } else if (args.assigned) {
      await ctx.db.insert("substanceGalleries", {
        substance_slug: args.substanceSlug,
        curated_slugs,
        removed_slugs,
        carousel_order: [],
        updated_at,
        updated_by: actor.email,
      });
    }
    const automatic = associationProvenance(replication, substance);
    return {
      status: "ok" as const,
      association:
        args.assigned || automatic
          ? {
              slug: substance.slug,
              title: substance.title,
              matchedVia: automatic?.matchedVia ?? "curated",
              effectSlug: automatic?.effectSlug ?? "",
              effectName:
                automatic?.matchedVia === "specific_drug"
                  ? substance.title
                  : automatic?.effectSlug ?? substance.title,
              excluded: false,
              curatedPosition: args.assigned
                ? curated_slugs.indexOf(args.replicationSlug) + 1
                : null,
            }
          : null,
      updated_at,
    };
  },
});

export const setReplicationExclusions = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    replicationSlug: v.string(),
    excludedSubstanceSlugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    if (args.excludedSubstanceSlugs.length > MAX_GALLERY_CURATION_SLUGS) {
      throw new Error(
        `A replication may be excluded from at most ${MAX_GALLERY_CURATION_SLUGS} substances per save.`,
      );
    }

    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.replicationSlug))
      .first();
    if (!replication) {
      throw new Error(`No replication found for slug "${args.replicationSlug}".`);
    }

    const wanted = new Set(args.excludedSubstanceSlugs);

    const galleries = await ctx.db.query("substanceGalleries").collect();
    const galleryBySubstance = new Map(galleries.map((row) => [row.substance_slug, row]));

    const candidates = [...args.excludedSubstanceSlugs];
    const seen = new Set(candidates);
    for (const row of galleries) {
      if (seen.has(row.substance_slug)) continue;
      if (!row.removed_slugs.includes(args.replicationSlug)) continue;
      seen.add(row.substance_slug);
      candidates.push(row.substance_slug);
    }

    const updated_at = new Date().toISOString();
    const updated_by = args.updatedBy ?? actor.email;
    const updated: string[] = [];
    const droppedCuratedPositions: { substance_slug: string; position: number }[] = [];

    for (const substanceSlug of candidates) {
      const gallery = galleryBySubstance.get(substanceSlug) ?? null;
      const isExcluded = gallery?.removed_slugs.includes(args.replicationSlug) ?? false;
      const wantsExclusion = wanted.has(substanceSlug);
      if (wantsExclusion === isExcluded) continue;

      if (wantsExclusion) {
        const substance = await uniqueSubstanceBySlug(ctx, substanceSlug);
        if (!substance) continue;
        const provenance = associationProvenance(replication, substance);
        const directProvenance = directGalleryAssociationProvenance(replication, gallery);
        if (!provenance && !directProvenance) continue;

        const removed_slugs = [...(gallery?.removed_slugs ?? []), args.replicationSlug];
        if (removed_slugs.length > MAX_GALLERY_CURATION_SLUGS) {
          throw new Error(
            `"${substanceSlug}" already suppresses ${MAX_GALLERY_CURATION_SLUGS} replications, the per-substance maximum.`,
          );
        }

        const curated = gallery?.curated_slugs ?? [];
        const curatedIndex = curated.indexOf(args.replicationSlug);
        if (curatedIndex >= 0) {
          droppedCuratedPositions.push({ substance_slug: substanceSlug, position: curatedIndex + 1 });
        }
        const curated_slugs =
          curatedIndex >= 0 ? curated.filter((slug) => slug !== args.replicationSlug) : curated;

        if (gallery) {
          await ctx.db.patch(gallery._id, { curated_slugs, removed_slugs, updated_at, updated_by });
        } else {
          await ctx.db.insert("substanceGalleries", {
            substance_slug: substanceSlug,
            curated_slugs,
            removed_slugs,
            updated_at,
            updated_by,
          });
        }
      } else {
        await ctx.db.patch(gallery!._id, {
          removed_slugs: gallery!.removed_slugs.filter((slug) => slug !== args.replicationSlug),
          updated_at,
          updated_by,
        });
      }

      updated.push(substanceSlug);
    }

    return { updated, droppedCuratedPositions };
  },
});
