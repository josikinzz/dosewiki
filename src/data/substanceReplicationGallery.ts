/**
 * Effect matching and curated-order merging for the per-substance Replication
 * Showcase (see CONTEXT.md → Replications Surface Language).
 *
 * A substance article never stores replication references. Its showcase is
 * *derived*: the visual effect names under
 * `subjective_effects.sensory.visual.subcategories` resolve to effect slugs
 * exactly the way the article's effect chips do, and those slugs select
 * publishable corpus rows by owning `effect_slug` or by `effect_tags`. An
 * optional `substanceGalleries` row then curates the derived set: a pinned
 * head, and a suppression list. This module is the single home of both steps
 * so the Convex read, the Convex write-path prune, the article showcase, and
 * the DevTools curation portal cannot disagree about what matches.
 *
 * Everything here is pure. Imports are relative rather than aliased because
 * the Convex bundler consumes this file too (as `convex/substanceGalleries.ts`
 * does `../src/data/substanceReplicationGallery`).
 */

import { z } from "zod";
import { resolveEffectNameAlias, type EffectLocation } from "./effectNameAliases";
import { slugify } from "../utils/slug";
import {
  isPublishableReplication,
  type MediaRole,
  type ReplicationType,
  type ReplicationWithUrl,
} from "../types/replications";
import { applyCuratedOrder } from "../../lib/curatedOrder";

/** The alias-lookup location of every chip in the article's visual group. */
const VISUAL_EFFECT_LOCATION: EffectLocation = "sensory.visual";

const EFFECT_HREF_PREFIX = "/effects/";
const EFFECT_CATEGORY_HREF_PREFIX = "/effects/category/";

/** How one corpus row earned its place in a substance's showcase. */
export type SubstanceGalleryMatchProvenance = {
  matchedVia: "effect_slug" | "effect_tags";
  /** The substance-derived effect slug the row matched on. */
  effectSlug: string;
};

/** The minimum a corpus row must carry to be matchable. */
export type SubstanceGalleryMatchableRow = {
  slug: string;
  type: ReplicationType;
  role?: MediaRole;
  effect_slug?: string;
  effect_tags?: string[];
};

export type SubstanceGalleryMatch<Row extends SubstanceGalleryMatchableRow> = {
  row: Row;
  provenance: SubstanceGalleryMatchProvenance;
};

export type SubstanceGalleryMatchResult<Row extends SubstanceGalleryMatchableRow> = {
  /** Publishable matches, in the order the corpus rows arrived (the default tail order). */
  matches: SubstanceGalleryMatch<Row>[];
  /**
   * Visual-effect display names that put nothing in the showcase: names with
   * no effect page to match through (unlinked or umbrella terms) and names
   * whose effect has no publishable replication. The curation portal teaches
   * from this list ("tag a replication with these to surface it here").
   */
  unmatchedEffectNames: string[];
};

/** The stored curation row's editable fields (`substanceGalleries` in Convex). */
export type SubstanceGalleryCuration = {
  curated_slugs?: readonly string[];
  removed_slugs?: readonly string[];
};

/** One item of the public per-substance read, URL-resolved for rendering. */
export type SubstanceGalleryItem = {
  replication: ReplicationWithUrl;
  provenance: SubstanceGalleryMatchProvenance;
};

/** The public `getPublicReplicationsForSubstance` payload. */
export type PublicSubstanceGallery = {
  items: SubstanceGalleryItem[];
  unmatchedEffectNames: string[];
};

/**
 * The one path this module reads out of a stored substance article. Stored as
 * `v.any()` in Convex, so the shape is proven here at the boundary, leniently:
 * only the fields consumed are named, junk entries drop out individually, and
 * a document without the path yields no names rather than an error.
 */
const visualEffectEntry = z.object({ name: z.string() });

const visualEffectNamesSource = z.object({
  sensory: z.object({
    visual: z.object({
      subcategories: z.record(
        z.string(),
        z.object({ effects: z.array(z.unknown()).catch([]) }),
      ),
    }),
  }),
});

/**
 * The visual-effect display names of one substance article, in document order,
 * deduplicated by slugified name (the same name under two subcategories is one
 * chip vocabulary entry, not two).
 *
 * Takes `unknown` because `subjective_effects` is stored as `v.any()` in
 * Convex; anything malformed simply contributes no names.
 */
export function visualEffectNamesOf(subjectiveEffects: unknown): string[] {
  const parsed = visualEffectNamesSource.safeParse(subjectiveEffects);
  if (!parsed.success) return [];

  const names: string[] = [];
  const seen = new Set<string>();
  for (const subcategory of Object.values(parsed.data.sensory.visual.subcategories)) {
    for (const raw of subcategory.effects) {
      const entry = visualEffectEntry.safeParse(raw);
      if (!entry.success) continue;
      const name = entry.data.name.trim();
      const key = slugify(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

export type VisualEffectSlugResolution = {
  /** Ordered, deduplicated effect slugs the names resolve to. */
  slugs: string[];
  /** Display name → resolved effect slug, for names that resolved. */
  slugByName: ReadonlyMap<string, string>;
  /**
   * Display names that resolve to no single effect page: deliberately unlinked
   * names, and umbrella terms whose chip points at a category index — a
   * category names a family, so there is no effect slug to match a
   * replication against.
   */
  unlinkableNames: string[];
};

/**
 * Resolve visual-effect display names to effect slugs exactly as the substance
 * article's effect chips do: `slugify(name)` looked up through
 * `resolveEffectNameAlias(…, "sensory.visual")`, falling back to the slugified
 * name itself when no alias table knows the name (the chips' own
 * `publicHref.effectFromName` derivation).
 */
export function resolveVisualEffectSlugs(names: readonly string[]): VisualEffectSlugResolution {
  const slugs: string[] = [];
  const seen = new Set<string>();
  const slugByName = new Map<string, string>();
  const unlinkableNames: string[] = [];

  for (const name of names) {
    const nameSlug = slugify(name);
    if (!nameSlug) {
      unlinkableNames.push(name);
      continue;
    }
    const alias = resolveEffectNameAlias(nameSlug, VISUAL_EFFECT_LOCATION);
    let slug: string | null;
    if (alias === undefined) {
      slug = nameSlug;
    } else if (alias === null || alias.startsWith(EFFECT_CATEGORY_HREF_PREFIX)) {
      slug = null;
    } else {
      slug = alias.slice(EFFECT_HREF_PREFIX.length);
    }

    if (slug === null) {
      unlinkableNames.push(name);
      continue;
    }
    slugByName.set(name, slug);
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }

  return { slugs, slugByName, unlinkableNames };
}

/**
 * Match a substance's visual-effect names against the replication corpus.
 *
 * A row matches when it is publishable (a replication row of a renderable
 * media kind — figures and audio never surface here) and any resolved slug is
 * its owning `effect_slug` or appears in its `effect_tags`. Provenance prefers
 * the owning slug; a tag match reports the first resolved slug (in the
 * substance's own name order) found among the tags.
 *
 * Matches lead with videos: an animated rendition is the closest thing the
 * corpus has to the experience itself, so the pre-curation default puts every
 * video before every image. Within each kind the incoming corpus order holds.
 * This is the showcase's default tail order — a stored curation's head order
 * (`mergeCuratedGallery`) still outranks it.
 */
export function matchSubstanceGalleryReplications<Row extends SubstanceGalleryMatchableRow>(
  rows: readonly Row[],
  visualEffectNames: readonly string[],
): SubstanceGalleryMatchResult<Row> {
  const { slugs, slugByName, unlinkableNames } = resolveVisualEffectSlugs(visualEffectNames);
  const slugSet = new Set(slugs);

  const matches: SubstanceGalleryMatch<Row>[] = [];
  // Effect slugs with at least one publishable row — via ownership *or* tag —
  // so a name whose only presence is a tag on an already-owned row still
  // counts as represented rather than being taught as unmatched.
  const representedSlugs = new Set<string>();

  for (const row of rows) {
    if (!isPublishableReplication(row)) continue;

    const ownedSlug = row.effect_slug && slugSet.has(row.effect_slug) ? row.effect_slug : null;
    const tags = row.effect_tags ?? [];
    const taggedSlugs = slugs.filter((slug) => tags.includes(slug));

    if (ownedSlug) representedSlugs.add(ownedSlug);
    for (const slug of taggedSlugs) representedSlugs.add(slug);

    if (ownedSlug) {
      matches.push({ row, provenance: { matchedVia: "effect_slug", effectSlug: ownedSlug } });
    } else if (taggedSlugs.length > 0) {
      matches.push({ row, provenance: { matchedVia: "effect_tags", effectSlug: taggedSlugs[0] } });
    }
  }

  const unlinkable = new Set(unlinkableNames);
  const unmatchedEffectNames = visualEffectNames.filter((name) => {
    if (unlinkable.has(name)) return true;
    const slug = slugByName.get(name);
    return slug !== undefined && !representedSlugs.has(slug);
  });

  const videos = matches.filter((match) => match.row.type === "video");
  const stills = matches.filter((match) => match.row.type !== "video");

  return { matches: [...videos, ...stills], unmatchedEffectNames };
}

/**
 * Apply a stored curation to the matched set: the curated head in its stored
 * order, then everything uncurated in the incoming default order, minus the
 * suppressed slugs. Curated slugs that match nothing are ignored rather than
 * leaving holes (`applyCuratedOrder`), so a stale curation degrades gracefully
 * at read time; the write path prunes them permanently.
 */
export function mergeCuratedGallery<Item>(
  matchedItems: readonly Item[],
  curation: SubstanceGalleryCuration | null | undefined,
  slugOf: (item: Item) => string,
): Item[] {
  const ordered = applyCuratedOrder(matchedItems, curation?.curated_slugs, slugOf);
  const removed = new Set(curation?.removed_slugs ?? []);
  return removed.size === 0 ? ordered : ordered.filter((item) => !removed.has(slugOf(item)));
}

export type NormalizedGalleryCuration = {
  /** Curated head, trimmed, deduplicated, pruned to currently matching slugs. */
  curatedSlugs: string[];
  /** Suppression list, trimmed, deduplicated, pruned to currently matching slugs. */
  removedSlugs: string[];
  /** What pruning dropped, so the editor can be told rather than left guessing. */
  prunedCurated: string[];
  prunedRemoved: string[];
};

function normalizeSlugList(slugs: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const slug = raw.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }
  return normalized;
}

/**
 * Normalize a curation write: trim and deduplicate both lists, reject any
 * curated∩removed overlap (a slug cannot be pinned and suppressed at once —
 * that is a client bug, not a preference), and prune slugs that no longer
 * match the substance so a deleted or renamed replication cannot survive as a
 * phantom position. Throws on overlap; returns the pruned echo otherwise.
 */
export function normalizeGalleryCuration(input: {
  curatedSlugs: readonly string[];
  removedSlugs: readonly string[];
  matchableSlugs: ReadonlySet<string>;
}): NormalizedGalleryCuration {
  const curated = normalizeSlugList(input.curatedSlugs);
  const removed = normalizeSlugList(input.removedSlugs);

  const removedSet = new Set(removed);
  const overlap = curated.filter((slug) => removedSet.has(slug));
  if (overlap.length > 0) {
    throw new Error(
      `A replication cannot be both curated and removed: ${overlap.join(", ")}`,
    );
  }

  const keep = (slugs: string[]) => {
    const kept: string[] = [];
    const pruned: string[] = [];
    for (const slug of slugs) {
      (input.matchableSlugs.has(slug) ? kept : pruned).push(slug);
    }
    return { kept, pruned };
  };

  const curatedSplit = keep(curated);
  const removedSplit = keep(removed);

  return {
    curatedSlugs: curatedSplit.kept,
    removedSlugs: removedSplit.kept,
    prunedCurated: curatedSplit.pruned,
    prunedRemoved: removedSplit.pruned,
  };
}
