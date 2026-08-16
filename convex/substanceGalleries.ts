import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replications";
import {
  matchSubstanceGalleryReplications,
  mergeCuratedGallery,
  normalizeGalleryCuration,
  resolveVisualEffectSlugs,
  visualEffectNamesOf,
} from "../src/data/substanceReplicationGallery";

/**
 * Per-substance Replication Showcase: derived effect matching plus the stored
 * `substanceGalleries` curation row.
 *
 * The matching, merging, and prune rules live in
 * `src/data/substanceReplicationGallery` — pure and shared with the article
 * showcase and the DevTools curation portal — so this module only wires them
 * to the database. The public read is served through
 * `lib/convex/publicData.replications` (`getPublicReplicationsForSubstance`),
 * cached under the replications tag.
 */

/** Enough to pin or suppress the whole corpus, small enough to stay one document. */
const MAX_GALLERY_CURATION_SLUGS = 250;

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
 * The ordered, publishable Replication Showcase for one substance: curated
 * head in stored order, surviving auto-matches in default corpus order,
 * suppressed slugs absent, with per-item match provenance and the substance's
 * unmatched visual-effect names for the portal's teaching state.
 *
 * A slug naming no substance, a substance with no visual effects, and a
 * substance whose effects match nothing all return an empty gallery — never
 * an error, because "nothing to show" is this surface's normal case.
 */
export const getPublicReplicationsForSubstance = query({
  args: { substance_slug: v.string() },
  handler: async (ctx, args) => {
    const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
    if (!substance) {
      return { items: [], unmatchedEffectNames: [] };
    }

    const visualNames = visualEffectNamesOf(substance.subjective_effects);
    if (visualNames.length === 0) {
      return { items: [], unmatchedEffectNames: [] };
    }

    const rows = await ctx.db.query("replications").collect();
    const { matches, unmatchedEffectNames } = matchSubstanceGalleryReplications(rows, visualNames);

    const gallery = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();

    const merged = mergeCuratedGallery(matches, gallery, (match) => match.row.slug);

    const urls = memoizedStorageUrls(ctx);
    const items = await Promise.all(
      merged.map(async ({ row, provenance }) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(urls, row, { preview: false });
        return { replication: { ...row, url, thumbnail_url }, provenance };
      }),
    );

    return { items, unmatchedEffectNames };
  },
});

/** How the curation portal's batched picker read pages the substance index. */
const CURATION_CANDIDATE_PAGE_SIZE = 32;
const CURATION_CANDIDATE_MAX_PAGE_SIZE = 100;

/**
 * One page of the curation portal's substance picker: every substance with its
 * publishable match count and whether a curation row exists. Editorial read —
 * it walks the whole article table — so it takes the same maintenance intent
 * as `replications.getStudioRows`. The caller (the batched Next route) drains
 * the cursor and answers the picker in one response.
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
        const visualNames = visualEffectNamesOf(substance.subjective_effects);
        const matchCount =
          visualNames.length === 0
            ? 0
            : matchSubstanceGalleryReplications(rows, visualNames).matches.length;

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
 * publishable matches in default corpus order with per-item provenance and
 * resolved media URLs, the stored curation row (or null), the substance's
 * matchable visual effects (`effectOptions`, what the portal's tag-to-add
 * control offers), and the unmatched visual-effect names the teaching state
 * lists. Unlike the public read this never merges — the portal needs the raw
 * default order and the curation separately to draw the three temperatures.
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

    const visualNames = visualEffectNamesOf(substance.subjective_effects);
    const rows = await ctx.db.query("replications").collect();
    const { matches, unmatchedEffectNames } = matchSubstanceGalleryReplications(rows, visualNames);

    const effects = await ctx.db.query("subjectiveEffects").collect();
    const effectNames = new Map(effects.map((effect) => [effect.slug, effect.name ?? effect.slug]));

    // What tagging a corpus row with could actually surface it here: the
    // article's visual-effect names that resolve to a real effect page, keyed
    // by that slug and labelled with the article's own wording. Names in
    // `unlinkableNames` resolve to nothing and are therefore not offered.
    const { slugByName } = resolveVisualEffectSlugs(visualNames);
    const effectOptions: { slug: string; name: string }[] = [];
    const offeredEffectSlugs = new Set<string>();
    for (const name of visualNames) {
      const slug = slugByName.get(name);
      if (slug === undefined || offeredEffectSlugs.has(slug)) continue;
      offeredEffectSlugs.add(slug);
      effectOptions.push({ slug, name });
    }

    const resolvedUrls = memoizedStorageUrls(ctx);
    const resolved = await Promise.all(
      matches.map(async ({ row, provenance }) => {
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
            effectName: effectNames.get(provenance.effectSlug) ?? provenance.effectSlug,
          },
        };
      }),
    );

    const gallery = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();

    return {
      substance: { slug: substance.slug, title: substance.title },
      matches: resolved,
      curation: gallery
        ? {
            curated_slugs: gallery.curated_slugs,
            removed_slugs: gallery.removed_slugs,
            updated_at: gallery.updated_at,
            updated_by: gallery.updated_by,
          }
        : null,
      effectOptions,
      unmatchedEffectNames,
    };
  },
});

/**
 * Replace one substance's curation with the full submitted arrays.
 *
 * Slugs that no longer match the substance are pruned here rather than stored
 * — a deleted, renamed, or retagged replication must not survive as a phantom
 * position — and what was dropped comes back to the caller so the editor can
 * be told rather than left guessing. A curated∩removed overlap is rejected
 * outright: it is a client bug, not a preference. The caller adopts the
 * returned pruned echo as its new state.
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

    if (
      args.curated_slugs.length > MAX_GALLERY_CURATION_SLUGS ||
      args.removed_slugs.length > MAX_GALLERY_CURATION_SLUGS
    ) {
      throw new Error(
        `A substance gallery curation may hold at most ${MAX_GALLERY_CURATION_SLUGS} slugs per list.`,
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
          updated_at: existing?.updated_at ?? "",
          updated_by: existing?.updated_by ?? null,
        },
      };
    }

    const rows = await ctx.db.query("replications").collect();
    const { matches } = matchSubstanceGalleryReplications(
      rows,
      visualEffectNamesOf(substance.subjective_effects),
    );

    const normalized = normalizeGalleryCuration({
      curatedSlugs: args.curated_slugs,
      removedSlugs: args.removed_slugs,
      matchableSlugs: new Set(matches.map((match) => match.row.slug)),
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
