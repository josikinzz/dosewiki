/**
 * Effect matching and the publish gate for the per-substance Replication
 * Showcase (see CONTEXT.md → Replications Surface Language).
 *
 * A substance article's automatic candidate pool is *derived*: the visual
 * effect names under `subjective_effects.sensory.visual.subcategories`
 * resolve to effect slugs exactly the way the article's effect chips do, and
 * those slugs select publishable corpus rows by owning `effect_slug` or by
 * `effect_tags`. A gallery may additionally store a direct association when an
 * editor curates an unmatched work; moving it from `curated_slugs` to
 * `removed_slugs` preserves that explicit association as an exclusion. What
 * the article actually shows is still the gallery's curated list and nothing
 * else (`mergeCuratedGallery`), with suppression outranking curation. This
 * module is the single home of matching, association, and write normalization
 * so Convex reads, the article showcase, and the curation portal agree.
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

/** The alias-lookup location of every chip in the article's visual group. */
const VISUAL_EFFECT_LOCATION: EffectLocation = "sensory.visual";

const EFFECT_HREF_PREFIX = "/effects/";
const EFFECT_CATEGORY_HREF_PREFIX = "/effects/category/";

/**
 * The ceiling on either stored curation list. One home for a number the Convex
 * mutation, the DevTools save route, and the portal's exclusion meter all have
 * to agree on — enough to order or suppress a whole showcase, small enough to
 * stay one document.
 */
export const GALLERY_CURATION_SLUG_CAP = 250;

/** How one corpus row earned its place in a substance's showcase. */
export type SubstanceGalleryMatchProvenance = {
  matchedVia: "effect_slug" | "effect_tags" | "title" | "curated";
  /** The matched effect slug, or the row's owning effect for a direct curation. */
  effectSlug: string;
};

/** The minimum a corpus row must carry to be matchable. */
export type SubstanceGalleryMatchableRow = {
  slug: string;
  type: ReplicationType;
  role?: MediaRole;
  title?: string;
  effect_slug?: string | null;
  effect_tags?: string[];
  /** Corpus-wide suppression: junk everywhere, so it proposes nowhere. */
  showcase_excluded?: boolean;
};

export type SubstanceGalleryMatch<Row extends SubstanceGalleryMatchableRow> = {
  row: Row;
  provenance: SubstanceGalleryMatchProvenance;
};

export type SubstanceGalleryMatchResult<Row extends SubstanceGalleryMatchableRow> = {
  /** Matchable candidates, in the order the corpus rows arrived. Publishing is a separate, curated decision. */
  matches: SubstanceGalleryMatch<Row>[];
  /**
   * Visual-effect display names that put nothing in the candidate pool: names
   * with no effect page to match through (unlinked or umbrella terms) and
   * names whose effect has no publishable replication. The curation portal
   * teaches from this list ("tag a replication with these to surface it here").
   */
  unmatchedEffectNames: string[];
};

/**
 * The stored gallery association fields: ordered published placements and
 * unordered per-substance exclusions.
 */
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

/** The identification fields that carry a name a replication title might use. */
const substanceNameSource = z.object({
  title: z.string().catch(""),
  identification: z
    .object({
      common_name: z.string().catch(""),
      substitutive_name: z.string().catch(""),
    })
    .partial()
    .catch({}),
});

/**
 * Every name a replication title could plausibly use for one substance: the
 * article title plus its identification names, which often arrive as a list
 * ("Ecstasy, Molly") and are split so each name matches on its own.
 *
 * Deduplicated case-insensitively, and single characters are dropped — a name
 * that short would match half the corpus by accident.
 */
export function substanceNamesOf(article: unknown): string[] {
  const parsed = substanceNameSource.safeParse(article);
  if (!parsed.success) return [];
  const raw = [
    parsed.data.title,
    parsed.data.identification?.common_name ?? "",
    parsed.data.identification?.substitutive_name ?? "",
  ];

  const names: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    for (const piece of entry.split(/[,;/]/)) {
      const name = piece.trim();
      const key = name.toLowerCase();
      if (name.length < 2 || seen.has(key)) continue;
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
 * Corpus-wide eligibility: publishable *and* not suppressed everywhere.
 *
 * Per-substance `removed_slugs` answers "good work, wrong article", which is
 * rare. Junk is junk on every article, and sweeping it per substance is what
 * drove curations into the slug cap, so `showcase_excluded` retires a row from
 * every candidate pool at once. This is the single gate: matching, direct
 * curation, and therefore the article and the portal all read it.
 */
export function isShowcaseEligible(row: SubstanceGalleryMatchableRow): boolean {
  return isPublishableReplication(row) && row.showcase_excluded !== true;
}

/** Characters that continue a substance token, so a match inside one is no match. */
const NAME_CHARACTER = /[a-z0-9_-]/;

/**
 * Does `title` name this substance?
 *
 * Chemical names live inside longer chemical names, so a bare substring test
 * would hand every 2C-B-FLY rendition to 2C-B and read "DOM" inside "random".
 * A hyphen continues a token rather than ending one, which is what separates
 * "2C-B Road" (a match) from "2C-B-FLY Grid" (not one), and "DMT" from
 * "5-MeO-DMT".
 */
function titleNamesSubstance(title: string, name: string): boolean {
  const haystack = title.toLowerCase();
  const needle = name.trim().toLowerCase();
  if (needle.length === 0) return false;
  for (let from = 0; from <= haystack.length - needle.length; ) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : haystack[at - 1];
    const after = haystack[at + needle.length] ?? "";
    if (!NAME_CHARACTER.test(before) && !NAME_CHARACTER.test(after)) return true;
    from = at + 1;
  }
  return false;
}

/**
 * Match a substance's visual-effect names against the replication corpus.
 *
 * A row matches when it is showcase-eligible (a replication row of a
 * renderable media kind, not suppressed corpus-wide — figures and audio never
 * surface here) and any resolved slug is its owning `effect_slug` or appears in
 * its `effect_tags`. Provenance prefers the owning slug; a tag match reports
 * the first resolved slug (in the substance's own name order) found among the
 * tags. A row the effect vocabulary misses still matches when its title names
 * the substance outright, which is the weakest of the three signals and so
 * reports last.
 *
 * Matches lead with videos: an animated rendition is the closest thing the
 * corpus has to the experience itself, so the candidate pool an editor reads
 * top-down puts every video before every image. Within each kind the incoming
 * corpus order holds. Name matches form a second tier below the effect matches
 * rather than interleaving with them, because an editor scanning the pool
 * should meet the vocabulary's own proposals first. This orders the *pool*, not
 * the article — nothing here publishes anything; only `mergeCuratedGallery`
 * does.
 */
export function matchSubstanceGalleryReplications<Row extends SubstanceGalleryMatchableRow>(
  rows: readonly Row[],
  visualEffectNames: readonly string[],
  substanceNames: readonly string[] = [],
): SubstanceGalleryMatchResult<Row> {
  const { slugs, slugByName, unlinkableNames } = resolveVisualEffectSlugs(visualEffectNames);
  const slugSet = new Set(slugs);
  const names = substanceNames.map((name) => name.trim()).filter((name) => name.length > 0);

  const matches: SubstanceGalleryMatch<Row>[] = [];
  const named: SubstanceGalleryMatch<Row>[] = [];
  // Effect slugs with at least one publishable row — via ownership *or* tag —
  // so a name whose only presence is a tag on an already-owned row still
  // counts as represented rather than being taught as unmatched.
  const representedSlugs = new Set<string>();

  for (const row of rows) {
    if (!isShowcaseEligible(row)) continue;

    const ownedSlug = row.effect_slug && slugSet.has(row.effect_slug) ? row.effect_slug : null;
    const tags = row.effect_tags ?? [];
    const taggedSlugs = slugs.filter((slug) => tags.includes(slug));

    if (ownedSlug) representedSlugs.add(ownedSlug);
    for (const slug of taggedSlugs) representedSlugs.add(slug);

    if (ownedSlug) {
      matches.push({ row, provenance: { matchedVia: "effect_slug", effectSlug: ownedSlug } });
      continue;
    }
    if (taggedSlugs.length > 0) {
      matches.push({ row, provenance: { matchedVia: "effect_tags", effectSlug: taggedSlugs[0] } });
      continue;
    }
    const title = row.title ?? "";
    if (title && names.some((name) => titleNamesSubstance(title, name))) {
      named.push({
        row,
        provenance: { matchedVia: "title", effectSlug: row.effect_slug ?? "name-match" },
      });
    }
  }

  const unlinkable = new Set(unlinkableNames);
  const unmatchedEffectNames = visualEffectNames.filter((name) => {
    if (unlinkable.has(name)) return true;
    const slug = slugByName.get(name);
    return slug !== undefined && !representedSlugs.has(slug);
  });

  const videosFirst = (tier: readonly SubstanceGalleryMatch<Row>[]) => [
    ...tier.filter((match) => match.row.type === "video"),
    ...tier.filter((match) => match.row.type !== "video"),
  ];

  return {
    matches: [...videosFirst(matches), ...videosFirst(named)],
    unmatchedEffectNames,
  };
}

/**
 * Return the direct-curation provenance for a stored gallery association.
 *
 * Exclusion does not erase an unmatched direct placement's association: it
 * changes the editorial decision from shown to explicitly suppressed. Retired
 * or otherwise ineligible corpus rows are never associations.
 */
export function directGalleryAssociationProvenance(
  row: SubstanceGalleryMatchableRow,
  curation: SubstanceGalleryCuration | null | undefined,
): SubstanceGalleryMatchProvenance | null {
  if (!isShowcaseEligible(row)) return null;
  const associated =
    curation?.curated_slugs?.includes(row.slug) === true
    || curation?.removed_slugs?.includes(row.slug) === true;
  if (!associated) return null;
  return {
    matchedVia: "curated",
    effectSlug: row.effect_slug ?? "explicit-curation",
  };
}

/**
 * Add showcase-eligible rows that have a stored association with this
 * substance even though its effect vocabulary does not match them.
 *
 * Direct curation establishes the association; moving that work to
 * `removed_slugs` preserves it as an explicit "not on this article" decision.
 * Both states use direct-curation provenance because neither was derived from
 * an effect or title match.
 */
export function includeDirectlyAssociatedRows<Row extends SubstanceGalleryMatchableRow>(
  rows: readonly Row[],
  matches: readonly SubstanceGalleryMatch<Row>[],
  curation: SubstanceGalleryCuration | null | undefined,
): SubstanceGalleryMatch<Row>[] {
  const matchedSlugs = new Set(matches.map((match) => match.row.slug));
  const direct: SubstanceGalleryMatch<Row>[] = [];
  for (const row of rows) {
    if (matchedSlugs.has(row.slug)) continue;
    const provenance = directGalleryAssociationProvenance(row, curation);
    if (provenance) direct.push({ row, provenance });
  }
  return [...matches, ...direct];
}

/**
 * The publish gate. A substance's showcase is exactly the works an editor
 * curated, in stored `curated_slugs` order, and nothing else. No curation row
 * — or a row whose curated list is empty — publishes nothing at all.
 *
 * This used to be "curated head, then every remaining match in default order",
 * which meant an article nobody had ever reviewed still shipped whatever the
 * effect matcher happened to pile up, and every newly uploaded replication
 * auto-appeared on every substance sharing its effect. The matcher now only
 * *proposes*: it fills the curation portal's candidate pool, and a work
 * reaches an article only once an editor puts it there. That also keeps
 * `removed_slugs` meaning "deliberately never show this here" rather than
 * doubling as "not reviewed yet".
 *
 * A removed slug is dropped even if it is also curated: a deliberate
 * suppression outranks a stray promotion, and the invariant must hold at read
 * time rather than resting on the write path's overlap rejection. Curated
 * slugs unavailable from the eligible association pool are skipped rather than
 * leaving holes, so stale curation degrades gracefully; writes prune them.
 */
export function mergeCuratedGallery<Item>(
  matchedItems: readonly Item[],
  curation: SubstanceGalleryCuration | null | undefined,
  slugOf: (item: Item) => string,
): Item[] {
  const curatedSlugs = curation?.curated_slugs;
  if (!curatedSlugs?.length) {
    return [];
  }

  const bySlug = new Map<string, Item>();
  for (const item of matchedItems) {
    const slug = slugOf(item);
    if (!bySlug.has(slug)) bySlug.set(slug, item);
  }

  const removed = new Set(curation?.removed_slugs ?? []);
  const published: Item[] = [];
  for (const slug of curatedSlugs) {
    if (removed.has(slug)) continue;
    const item = bySlug.get(slug);
    if (item === undefined) continue;
    // A duplicate mention places its item once, at its first position.
    bySlug.delete(slug);
    published.push(item);
  }
  return published;
}

export type NormalizedGalleryCuration = {
  /** Curated list, trimmed, deduplicated, pruned to showcase-eligible corpus slugs. */
  curatedSlugs: string[];
  /** Suppression list, trimmed, deduplicated, pruned to showcase-eligible corpus slugs. */
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
 * that is a client bug, not a preference), and prune both lists against the
 * showcase-eligible corpus. Direct curation and direct exclusion therefore
 * survive without a derived effect match, while deleted, retired, or otherwise
 * ineligible replications cannot survive as phantom associations. Throws on
 * overlap; returns the pruned echo otherwise.
 */
export function normalizeGalleryCuration(input: {
  curatedSlugs: readonly string[];
  removedSlugs: readonly string[];
  matchableSlugs: ReadonlySet<string>;
  curatableSlugs?: ReadonlySet<string>;
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

  const keep = (slugs: string[], allowed: ReadonlySet<string>) => {
    const kept: string[] = [];
    const pruned: string[] = [];
    for (const slug of slugs) {
      (allowed.has(slug) ? kept : pruned).push(slug);
    }
    return { kept, pruned };
  };

  const associationSlugs = input.curatableSlugs ?? input.matchableSlugs;
  const curatedSplit = keep(curated, associationSlugs);
  const removedSplit = keep(removed, associationSlugs);

  return {
    curatedSlugs: curatedSplit.kept,
    removedSlugs: removedSplit.kept,
    prunedCurated: curatedSplit.pruned,
    prunedRemoved: removedSplit.pruned,
  };
}
