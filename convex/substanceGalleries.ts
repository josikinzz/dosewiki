import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replications";
import {
  matchSubstanceGalleryReplications,
  includeDirectlyCuratedRows,
  mergeCuratedGallery,
  normalizeGalleryCuration,
  resolveVisualEffectSlugs,
  visualEffectNamesOf,
  type SubstanceGalleryMatchableRow,
  type SubstanceGalleryMatchProvenance,
  substanceNamesOf,
  isShowcaseEligible,
  GALLERY_CURATION_SLUG_CAP,
} from "../src/data/substanceReplicationGallery";
import type { ReplicationAssociation } from "../src/features/dev/tools/replication-studio/replicationAssociationModel";

/**
 * Per-substance Replication Showcase: derived effect matching behind a stored
 * `substanceGalleries` curation row that acts as a publish gate.
 *
 * Matching only proposes candidates. An article shows the curated slugs and
 * nothing else, so a substance nobody has curated shows no showcase at all —
 * see `mergeCuratedGallery` for why the automatic pile had to stop shipping.
 * The matching, gate, and prune rules live in
 * `src/data/substanceReplicationGallery` — pure and shared with the article
 * showcase and the DevTools curation portal — so this module only wires them
 * to the database. The public read is served through
 * `lib/convex/publicData.replications` (`getPublicReplicationsForSubstance`),
 * cached under the replications tag.
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
 * The published Replication Showcase for one substance: the curated slugs in
 * their stored order, suppressed slugs absent, with per-item match provenance
 * and the substance's unmatched visual-effect names for the portal's teaching
 * state.
 *
 * Curation is a publish gate (`mergeCuratedGallery`), so a substance with no
 * curation row, or one whose curated list is empty, returns no items however
 * many works its effects match. A slug naming no substance, a substance with
 * no visual effects, and a substance whose effects match nothing return the
 * same empty gallery — never an error, because "nothing to show" is this
 * surface's normal case.
 */
export const getPublicReplicationsForSubstance = query({
  args: { substance_slug: v.string() },
  handler: async (ctx, args) => {
    const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
    if (!substance) {
      return { items: [], unmatchedEffectNames: [] };
    }

    const rows = await ctx.db.query("replications").collect();
    const visualNames = visualEffectNamesOf(substance.subjective_effects);
    const { matches, unmatchedEffectNames } = matchSubstanceGalleryReplications(
      rows,
      visualNames,
      substanceNamesOf(substance),
    );

    const gallery = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();

    const merged = mergeCuratedGallery(
      includeDirectlyCuratedRows(rows, matches, gallery),
      gallery,
      (match) => match.row.slug,
    );

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
        const substanceNames = substanceNamesOf(substance);
        const matchCount =
          visualNames.length === 0 && substanceNames.length === 0
            ? 0
            : matchSubstanceGalleryReplications(rows, visualNames, substanceNames).matches.length;

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
 * every publishable match in default corpus order with per-item provenance and
 * resolved media URLs, the stored curation row (or null), the substance's
 * matchable visual effects (`effectOptions`, what the portal's tag-to-add
 * control offers), and the unmatched visual-effect names the teaching state
 * lists.
 *
 * Unlike the public read this never applies the publish gate: the portal is
 * the one surface that must see the whole candidate pool, curated or not, and
 * it needs the raw match order and the curation separately to draw the three
 * temperatures. So `matches` here is a superset of what the article shows —
 * often a large one, since an uncurated substance publishes nothing.
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
    const { matches, unmatchedEffectNames } = matchSubstanceGalleryReplications(
      rows,
      visualNames,
      substanceNamesOf(substance),
    );

    const gallery = await ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first();
    const available = includeDirectlyCuratedRows(rows, matches, gallery);

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
            effectName: effectNames.get(provenance.effectSlug) ?? provenance.effectSlug,
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
          updated_at: existing?.updated_at ?? "",
          updated_by: existing?.updated_by ?? null,
        },
      };
    }

    const rows = await ctx.db.query("replications").collect();
    const { matches } = matchSubstanceGalleryReplications(
      rows,
      visualEffectNamesOf(substance.subjective_effects),
      substanceNamesOf(substance),
    );

    const normalized = normalizeGalleryCuration({
      curatedSlugs: args.curated_slugs,
      removedSlugs: args.removed_slugs,
      matchableSlugs: new Set(matches.map((match) => match.row.slug)),
      curatableSlugs: new Set(
        rows.filter(isShowcaseEligible).map((row) => row.slug),
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

/**
 * How this one replication earns a place on a substance with these visual
 * effect names and its own names, or null when it earns none.
 *
 * A single-row corpus handed to the shared matcher, so the owning-slug-beats-tag
 * precedence, the tag pick, the title fallback, and the eligibility gate cannot
 * drift from what the article and the per-substance portal derive.
 */
function associationProvenance(
  replication: SubstanceGalleryMatchableRow,
  visualEffectNames: readonly string[],
  substanceNames: readonly string[] = [],
): SubstanceGalleryMatchProvenance | null {
  if (visualEffectNames.length === 0 && substanceNames.length === 0) return null;
  const { matches } = matchSubstanceGalleryReplications(
    [replication],
    visualEffectNames,
    substanceNames,
  );
  return matches.length > 0 ? matches[0].provenance : null;
}

/**
 * The other side of the same derivation: which substance articles one
 * replication is eligible for, and which of those actually show it.
 *
 * Nothing links a replication to a substance — the association is derived on
 * every read from the article's visual-effect names, so there is no join row to
 * list. This walks the article table instead and tests this one replication
 * against each article's derived effect slugs, reusing
 * `matchSubstanceGalleryReplications` with a single-row corpus so the owning
 * slug still beats a tag and the publishable gate still applies. Editorial read
 * over the whole article table, so it takes `replicationMaintenance` and pages
 * exactly like `listCurationCandidatesPage`; the caller drains the cursor.
 *
 * `excluded` and `curatedPosition` are the stored delta from that substance's
 * `substanceGalleries` row — the saved baseline the editor's draft is diffed
 * against, never anything derived from the request. Since curation is a
 * publish gate, `curatedPosition !== null` is the only field that means the
 * work appears on that article; eligibility alone means it could.
 *
 * A slug naming no replication, or naming a figure or audio row, is eligible
 * for no article at all: that answers with an empty page rather than an error,
 * the same way the public read treats "nothing to show" as normal.
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
      const visualNames = visualEffectNamesOf(substance.subjective_effects);
      const gallery = await ctx.db
        .query("substanceGalleries")
        .withIndex("by_substance", (q) => q.eq("substance_slug", substance.slug))
        .first();
      const derivedProvenance = associationProvenance(
        replication,
        visualNames,
        substanceNamesOf(substance),
      );
      const directlyCurated = gallery?.curated_slugs.includes(args.replicationSlug) ?? false;
      if (!derivedProvenance && !directlyCurated) continue;
      const provenance = derivedProvenance ?? {
        matchedVia: "curated" as const,
        effectSlug: replication.effect_slug ?? "explicit-curation",
      };

      // The article's own wording for the matched effect slug, paired the way
      // `getCurationDetail`'s `effectOptions` pairs it: first name in document
      // order that resolves to this slug.
      const { slugByName } = resolveVisualEffectSlugs(visualNames);
      let effectName = provenance.effectSlug;
      for (const name of visualNames) {
        if (slugByName.get(name) === provenance.effectSlug) {
          effectName = name;
          break;
        }
      }

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
 * Exclusion is deliberately per-substance rather than untagging the corpus row:
 * an `effect_slug` or `effect_tags` edit would drop the replication off every
 * article deriving that effect, and off future ones too. "Not on this article"
 * is an editorial judgement about one pairing, so it is stored as one
 * substance's delta.
 *
 * A substance this replication does not match is never written — there would be
 * nothing to suppress, and `upsert` would prune the phantom slug on the next
 * save anyway. Adding an exclusion also strips the slug from that substance's
 * `curated_slugs`, because the two lists may never overlap
 * (`normalizeGalleryCuration` rejects it); each pin so dropped comes back in
 * `droppedCuratedPositions` with the 1-based position it held, so the editor is
 * told rather than left to notice. Substances whose row would not change are
 * not written and are absent from `updated`.
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
        const provenance = associationProvenance(
          replication,
          visualEffectNamesOf(substance.subjective_effects),
          substanceNamesOf(substance),
        );
        if (!provenance) continue;

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
