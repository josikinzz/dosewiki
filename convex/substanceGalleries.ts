import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replications";
import {
  directGalleryAssociationProvenance,
  isCombinationReplication,
  matchSubstanceGalleryReplications,
  includeDirectlyAssociatedRows,
  mergeCuratedGallery,
  normalizeGalleryCarouselOrder,
  normalizeGalleryCuration,
  substanceGalleryTargetOf,
  type SubstanceGalleryMatchableRow,
  type SubstanceGalleryMatchProvenance,
  isShowcaseEligible,
  GALLERY_CURATION_SLUG_CAP,
} from "../src/data/substanceReplicationGallery";
import type { ReplicationAssociation } from "../src/features/dev/tools/replication-studio/replicationAssociationModel";

/**
 * Per-substance Replication Showcase: automatic drug/class placement and the
 * low-priority Visual Disconnection still-image fallback behind stored
 * editorial ordering and exclusion deltas.
 *
 * Exact drug work belongs only to that drug. General dissociative and
 * deliriant work belongs to every article carrying that psychoactive class.
 * Eligible Visual Disconnection stills close every dissociative collection.
 * General psychedelic work and combinations are never broadly automatic.
 * Stored `curated_slugs` retain unmatched direct placements.
 * `carousel_order` is the exact cross-tier presentation prefix, while
 * `removed_slugs` suppresses every source.
 *
 * The pure policy lives in `src/data/substanceReplicationGallery` so public
 * reads, editor reads, association inspection, and writes cannot drift.
 */

/** One shared ceiling with the save route and the portal's exclusion meter. */
const MAX_GALLERY_CURATION_SLUGS = GALLERY_CURATION_SLUG_CAP;

/**
 * The substance for a slug, or null. Mirrors `substanceIndex:getPublicBySlug`:
 * a duplicated slug is ambiguous and treated as not found rather than letting
 * two articles fight over one gallery.
 */
async function uniqueSubstanceBySlug(ctx: QueryCtx, slug: string) {
  const matches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(2);
  return matches.length === 1 ? matches[0] : null;
}

/** The stored curation row for one substance, or null when never curated. */
export const getBySubstance = query({
  args: { substance_slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();
  },
});

/**
 * The published Replication Showcase for one substance: automatic placements
 * in policy order, with stored curation ordering within tiers, direct manual
 * associations after exact/class placement, Visual Disconnection stills last,
 * and stored suppression applied to every source.
 */
export const getPublicReplicationsForSubstance = query({
  args: { substance_slug: v.string() },
  handler: async (ctx, args) => {
    const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
    if (!substance) {
      return { items: [] };
    }

    const rows = await ctx.db.query("replications").collect();
    const target = substanceGalleryTargetOf(substance);
    const matches = target
      ? matchSubstanceGalleryReplications(rows, target).matches
      : [];

    const gallery = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();

    const merged = mergeCuratedGallery(
      includeDirectlyAssociatedRows(rows, matches, gallery),
      gallery,
    );

    const urls = memoizedStorageUrls(ctx);
    const items = await Promise.all(
      merged.map(async ({ row, provenance }) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(urls, row, { preview: false });
        return { replication: { ...row, url, thumbnail_url }, provenance };
      }),
    );

    return { items };
  },
});

/** How the curation portal's batched picker read pages the substance index. */
const CURATION_CANDIDATE_PAGE_SIZE = 32;
const CURATION_CANDIDATE_MAX_PAGE_SIZE = 100;

/**
 * One page of the curation portal's substance picker: every substance with its
 * automatic/direct candidate count and whether a curation delta exists.
 */
export const listCurationCandidatesPage = query({
  args: {
    apiKey: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const numItems = Math.min(
      Math.max(Math.floor(args.limit ?? CURATION_CANDIDATE_PAGE_SIZE), 1),
      CURATION_CANDIDATE_MAX_PAGE_SIZE,
    );
    const page = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems,
    });

    const rows = await ctx.db.query("replications").collect();

    const items = await Promise.all(
      page.page.map(async (substance) => {
        const target = substanceGalleryTargetOf(substance);
        const matchCount = target
          ? matchSubstanceGalleryReplications(rows, target).matches.length
          : 0;

        const gallery = await ctx.db
          .query("substanceGalleries")
          .withIndex("by_substance", (q) => q.eq("substance_slug", substance.slug))
          .first();

        return {
          slug: substance.slug,
          title: substance.title,
          match_count: matchCount,
          curated: gallery !== null,
          curated_count: gallery?.curated_slugs.length ?? 0,
          removed_count: gallery?.removed_slugs.length ?? 0,
        };
      }),
    );

    return { items, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Everything the curation portal's per-substance panel draws in one read:
 * automatic policy matches plus unmatched rows carrying a stored direct
 * curation or exclusion, with provenance and resolved media URLs.
 *
 * Public ordering is automatic-tier first; stored curation is an ordering and
 * direct-association delta rather than a publication gate.
 *
 * Returns null for a slug naming no (or an ambiguous) substance.
 */
export const getCurationDetail = query({
  args: {
    apiKey: v.optional(v.string()),
    substance_slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
    if (!substance) {
      return null;
    }

    const rows = await ctx.db.query("replications").collect();
    const target = substanceGalleryTargetOf(substance);
    const matches = target
      ? matchSubstanceGalleryReplications(rows, target).matches
      : [];

    const gallery = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();
    const available = includeDirectlyAssociatedRows(rows, matches, gallery);

    const effects = await ctx.db.query("subjectiveEffects").collect();
    const effectNames = new Map(effects.map((effect) => [effect.slug, effect.name ?? effect.slug]));

    // Effect identity remains presentation metadata for each work. It no
    // longer decides which substance articles receive the row.

    const resolvedUrls = memoizedStorageUrls(ctx);
    const resolved = await Promise.all(
      available.map(async ({ row, provenance }) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(resolvedUrls, row, { preview: false });
        return {
          replication: {
            id: row._id,
            slug: row.slug,
            title: row.title,
            artist: row.artist,
            type: row.type,
            effect_slug: row.effect_slug ?? null,
            effect_name: row.effect_slug
              ? effectNames.get(row.effect_slug) ?? row.effect_slug
              : null,
            effect_tags: row.effect_tags ?? [],
            credit_line: row.credit_line ?? null,
            rights_status: row.rights_status ?? null,
            url,
            thumbnail_url,
            format: row.format,
          },
          provenance: {
            ...provenance,
            effectName:
              provenance.matchedVia === "specific_drug"
                ? substance.title
                : provenance.matchedVia === "drug_class"
                  ? provenance.drugClass
                  : effectNames.get(provenance.effectSlug) ?? provenance.effectSlug,
          },
        };
      }),
    );

    return {
      substance: { slug: substance.slug, title: substance.title },
      matches: resolved,
      curation: gallery
        ? {
            curated_slugs: gallery.curated_slugs,
            removed_slugs: gallery.removed_slugs,
            carousel_order: gallery.carousel_order ?? [],
            updated_at: gallery.updated_at,
            updated_by: gallery.updated_by,
          }
        : null,
    };
  },
});

/**
 * Replace one substance's curation with the full submitted arrays.
 *
 * Slugs that are no longer showcase-eligible are pruned here rather than
 * stored — a deleted, retired, or otherwise ineligible replication must not
 * survive as a phantom association — and what was dropped comes back so the
 * editor can be told rather than left guessing. A curated∩removed overlap is
 * rejected outright: it is a client bug, not a preference. The caller adopts
 * the returned pruned echo as its new state.
 *
 * `expectedUpdatedAt` is the version check, in the spirit of
 * `replications:updateEditorialFields`' `expected` snapshot: omit it to write
 * unconditionally, pass `null` to assert this substance has never been
 * curated, or pass the `updated_at` the editor loaded to assert nobody has
 * saved since. A failed check writes nothing and returns
 * `{ status: "conflict", server }` carrying the row as it stands right now, so
 * the caller can show the editor both sides instead of clobbering a colleague.
 * Every write returns `{ status: "ok", … }`.
 */
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
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

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

    // Checked before the corpus scan: a stale save is answered with the row as
    // it stands, not with work done on a payload nobody is going to store.
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

/** Replace the exact presentation order for one substance's current showcase. */
export const setCarouselOrder = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    substance_slug: v.string(),
    carousel_order: v.array(v.string()),
    expectedUpdatedAt: v.optional(v.union(v.string(), v.null())),
    expectedCarouselOrder: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });
    if (args.carousel_order.length > MAX_GALLERY_CURATION_SLUGS) {
      throw new Error(
        `This carousel orders ${args.carousel_order.length} works; the limit is ${MAX_GALLERY_CURATION_SLUGS}.`,
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

    const rows = await ctx.db.query("replications").collect();
    const target = substanceGalleryTargetOf(substance);
    const matches = target
      ? matchSubstanceGalleryReplications(rows, target).matches
      : [];
    const included = mergeCuratedGallery(
      includeDirectlyAssociatedRows(rows, matches, existing),
      existing,
    );
    const normalized = normalizeGalleryCarouselOrder(
      args.carousel_order,
      new Set(included.map((item) => item.row.slug)),
    );
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

/**
 * How this one replication earns an automatic place on a substance, or null.
 * A single-row corpus is handed to the shared policy so exact-drug,
 * permitted-class, combination, and eligibility rules cannot drift.
 */
function associationProvenance(
  replication: SubstanceGalleryMatchableRow,
  substance: unknown,
): SubstanceGalleryMatchProvenance | null {
  const target = substanceGalleryTargetOf(substance);
  if (!target) return null;
  const { matches } = matchSubstanceGalleryReplications([replication], target);
  return matches.length > 0 ? matches[0].provenance : null;
}

/**
 * The other side of the same derivation: which substance articles one
 * replication is automatically or directly associated with.
 *
 * `excluded` and `curatedPosition` are the stored editorial delta. Automatic
 * associations publish unless excluded; direct associations publish when
 * curated and not excluded.
 */
export const getReplicationAssociationsPage = query({
  args: {
    apiKey: v.optional(v.string()),
    replicationSlug: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

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
      const gallery = await ctx.db
        .query("substanceGalleries")
        .withIndex("by_substance", (q) => q.eq("substance_slug", substance.slug))
        .first();
      const derivedProvenance = associationProvenance(replication, substance);
      const directProvenance = directGalleryAssociationProvenance(replication, gallery);
      const provenance = derivedProvenance ?? directProvenance;
      if (!provenance) continue;

      const effectName =
        provenance.matchedVia === "specific_drug"
          ? substance.title
          : provenance.matchedVia === "drug_class"
            ? provenance.drugClass
            : provenance.matchedVia === "visual_disconnection"
              ? "Visual Disconnection"
              : provenance.effectSlug;

      const curatedIndex = gallery ? gallery.curated_slugs.indexOf(args.replicationSlug) : -1;

      items.push({
        slug: substance.slug,
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

/** Add or remove one explicit replication-to-substance association atomically. */
export const setReplicationDirectAssociation = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    replicationSlug: v.string(),
    substanceSlug: v.string(),
    assigned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });
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

/**
 * Reconcile which substances suppress one replication, from the replication's
 * side.
 *
 * `excludedSubstanceSlugs` is the authoritative full set, unordered: every
 * named substance ends up suppressing this replication and every other
 * substance that currently suppresses it stops. Storage is unchanged — each
 * decision lands in that one substance's `removed_slugs`, the same field the
 * per-substance curation portal writes.
 *
 * Exclusion is per-substance: a work may be appropriate for its exact drug but
 * still be a poor editorial fit on that article. Adding an exclusion strips a
 * manual position because the two stored lists may never overlap; each dropped
 * position is returned to the editor.
 */
export const setReplicationExclusions = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    replicationSlug: v.string(),
    excludedSubstanceSlugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

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

    // Curated rows are the only place an existing exclusion can hide, and there
    // is no index from a suppressed slug back to its substances, so the delta
    // table is read whole. It holds one document per curated substance.
    const galleries = await ctx.db.query("substanceGalleries").collect();
    const galleryBySubstance = new Map(galleries.map((row) => [row.substance_slug, row]));

    // Every substance whose stored state could differ from the submitted set:
    // the named ones (which must still match to be written) and the ones
    // already suppressing this replication (which must stop if unnamed). A
    // matching substance that is neither named nor suppressed has nothing to
    // change, so it is never read.
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
        // Only a stored row can carry an exclusion, so `gallery` is non-null
        // here; dropping one leaves the rest of the curation untouched.
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
