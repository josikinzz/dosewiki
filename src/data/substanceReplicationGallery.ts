/**
 * Drug-association policy and editorial ordering for the per-substance
 * Replication Showcase (see docs/glossary.md → Replications Surface Language).
 *
 * Automatic placement is deliberately narrower than general visual-effect
 * matching: a standalone drug mention belongs only to that drug, while a
 * general dissociative or deliriant work belongs to every article in that
 * class. Dissociative articles additionally inherit eligible still images
 * owned by Visual Disconnection, after every higher-priority placement.
 * General psychedelic work is never spread across psychedelic articles, and
 * combinations are never proposed for a single-substance showcase.
 *
 * Stored `curated_slugs` are a direct-association delta and a legacy priority
 * list within automatic tiers. `carousel_order` is the exact editorial prefix
 * across all tiers; every unlisted work keeps the automatic order.
 * `removed_slugs` always wins.
 *
 * Everything here is pure. Imports are relative because the Postgres bundler
 * consumes this file through `server/substanceGalleries.ts`.
 */
import { DISSOCIATIVE_TITLE_DRUG_RULES } from "./replicationTitleDrugAliases";

import { z } from "zod";
import { applyCuratedOrder } from "../../lib/curatedOrder";
import {
  isPublishableReplication,
  isVisualReplication,
  type MediaRole,
  type ReplicationDrugClass,
  type ReplicationTitleDrug,
  type ReplicationType,
  type ReplicationWithUrl,
} from "../types/replications";

/**
 * The ceiling on either stored curation list. One home for a number the Postgres
 * mutation, the DevTools save route, and the portal's exclusion meter all have
 * to agree on.
 */
export const GALLERY_CURATION_SLUG_CAP = 250;

const TITLE_DRUG_ROUTE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  dxm: "dextromethorphan",
  metocin: "4-ho-met",
  "nitrous-oxide": "nitrous",
});

const GENERAL_CLASS_ARTICLE_LABEL: Readonly<
  Partial<Record<ReplicationDrugClass, string>>
> = Object.freeze({
  dissociatives: "Dissociative",
  deliriants: "Deliriant",
});

const VISUAL_DISCONNECTION_EFFECT_SLUG = "visual-disconnection";

type AutomaticSubstanceMatchKind = | "specific_drug"
| "drug_class"
| "visual_disconnection"

/** How one corpus row earned its place in a substance's showcase. */
export type SubstanceGalleryMatchProvenance = {
  matchedVia: AutomaticSubstanceMatchKind | "curated";
  /** The owning effect remains the chip shown beside the work. */
  effectSlug: string;
  /** Present for a standalone title-drug placement. */
  substanceSlug?: string;
  /** Present for a permitted general-class or dissociative-effect placement. */
  drugClass?: "dissociatives" | "deliriants";
};

type SubstanceGalleryTitleClassMention = {
  class: ReplicationDrugClass;
  matched_title_text: string;
}

/** The minimum a corpus row must carry to be matchable. */
export type SubstanceGalleryMatchableRow = {
  slug: string;
  title: string;
  type: ReplicationType;
  role?: MediaRole;
  effect_slug?: string | null;
  title_drugs?: ReplicationTitleDrug[];
  title_class_mentions?: SubstanceGalleryTitleClassMention[];
  /** Corpus-wide suppression: junk or a combination belongs on no drug article. */
  showcase_excluded?: boolean;
  replication_status?: "replication" | "not-replication" | "unclear" | "unreviewed" | "source-corrupt";
  publication_state?: "published" | "duplicate-suppressed";
};

export type SubstanceGalleryTarget = {
  slug: string;
  psychoactiveClasses: readonly string[];
};

export type SubstanceGalleryMatch<Row extends SubstanceGalleryMatchableRow> = {
  row: Row;
  provenance: SubstanceGalleryMatchProvenance;
};

export type SubstanceGalleryMatchResult<Row extends SubstanceGalleryMatchableRow> = {
  /** Automatic candidates in specific, class-general, then visual-fallback order. */
  matches: SubstanceGalleryMatch<Row>[];
};

/**
 * Stored association and presentation fields. `curated_slugs` can also create a
 * direct association; `carousel_order` only sequences already-included works.
 */
export type SubstanceGalleryCuration = {
  curated_slugs?: readonly string[];
  removed_slugs?: readonly string[];
  carousel_order?: readonly string[];
  disabled?: boolean;
};

/** One item of the public per-substance read, URL-resolved for rendering. */
export type SubstanceGalleryItem = {
  replication: ReplicationWithUrl;
  provenance: SubstanceGalleryMatchProvenance;
};

/** The public `getPublicReplicationsForSubstance` payload. */
export type PublicSubstanceGallery = {
  items: SubstanceGalleryItem[];
  carouselOrder?: readonly string[];
};

const substanceGalleryTargetSource = z.object({
  slug: z.string(),
  classification: z
    .object({
      psychoactive_class: z.array(z.string()).catch([]),
    })
    .partial()
    .catch({}),
});

/** Parse the two article fields that own automatic replication placement. */
export function substanceGalleryTargetOf(article: unknown): SubstanceGalleryTarget | null {
  const parsed = substanceGalleryTargetSource.safeParse(article);
  if (!parsed.success) return null;
  return {
    slug: parsed.data.slug,
    psychoactiveClasses: parsed.data.classification?.psychoactive_class ?? [],
  };
}

/** Convert title-taxonomy identity into the article route it addresses. */
export function canonicalTitleDrugRoute(slug: string): string {
  return TITLE_DRUG_ROUTE_ALIASES[slug] ?? slug;
}

/** Reviewed dissociative names found directly in a title, longest match first. */
export function reviewedDissociativeTitleDrugRoutesOf(title: string): string[] {
  const candidates: { route: string; start: number; end: number }[] = [];
  for (const [slug, _name, _drugClass, pattern] of DISSOCIATIVE_TITLE_DRUG_RULES) {
    pattern.lastIndex = 0;
    for (const match of title.matchAll(pattern)) {
      candidates.push({
        route: canonicalTitleDrugRoute(slug),
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  candidates.sort(
    (left, right) =>
      (right.end - right.start) - (left.end - left.start)
      || left.start - right.start,
  );
  const accepted: typeof candidates = [];
  for (const candidate of candidates) {
    if (
      accepted.some(
        (existing) =>
          candidate.start >= existing.start && candidate.end <= existing.end,
      )
    ) {
      continue;
    }
    accepted.push(candidate);
  }
  accepted.sort((left, right) => left.start - right.start);
  return [...new Set(accepted.map((candidate) => candidate.route))];
}

/** Distinct article routes named by taxonomy or a reviewed title alias. */
export function titleDrugRoutesOf(row: SubstanceGalleryMatchableRow): string[] {
  const routes: string[] = [];
  const seen = new Set<string>();
  for (const drug of row.title_drugs ?? []) {
    const route = canonicalTitleDrugRoute(drug.slug);
    if (!route || seen.has(route)) continue;
    seen.add(route);
    routes.push(route);
  }
  for (const route of reviewedDissociativeTitleDrugRoutesOf(row.title)) {
    if (seen.has(route)) continue;
    seen.add(route);
    routes.push(route);
  }
  return routes;
}

/** Distinct broad classes explicitly named by a row, preserving source order. */
export function titleDrugClassesOf(row: SubstanceGalleryMatchableRow): ReplicationDrugClass[] {
  const classes: ReplicationDrugClass[] = [];
  const seen = new Set<ReplicationDrugClass>();
  for (const mention of row.title_class_mentions ?? []) {
    if (seen.has(mention.class)) continue;
    seen.add(mention.class);
    classes.push(mention.class);
  }
  return classes;
}

const COMPACT_COMBINATION_TITLE_PATTERNS = [/\blsdxm\b/iu];

/**
 * A combination is multiple distinct specific drugs, a class-only cross-class
 * work, or one of the reviewed compact labels that can predate corrected title
 * taxonomy. Repeated aliases for one route remain one substance.
 *
 * `showcase_excluded` is the editorial guard for other titles that defeat
 * deterministic extraction.
 */
export function isCombinationReplication(row: SubstanceGalleryMatchableRow): boolean {
  if (COMPACT_COMBINATION_TITLE_PATTERNS.some((pattern) => pattern.test(row.title))) return true;
  const routes = titleDrugRoutesOf(row);
  if (routes.length > 1) return true;
  return routes.length === 0 && titleDrugClassesOf(row).length > 1;
}

/**
 * Corpus-wide eligibility shared by automatic and direct placement.
 *
 * The showcase is a frame carousel with a poster per slide, so it takes only
 * the kinds a frame can draw; a published audio row belongs to the audio
 * surfaces instead.
 */
export function isShowcaseEligible(row: SubstanceGalleryMatchableRow): boolean {
  return (
    isPublishableReplication(row)
    && isVisualReplication(row)
    && row.showcase_excluded !== true
    && !isCombinationReplication(row)
  );
}

function automaticProvenance(
  row: SubstanceGalleryMatchableRow,
  target: SubstanceGalleryTarget,
): SubstanceGalleryMatchProvenance | null {
  if (!isShowcaseEligible(row)) return null;

  const routes = titleDrugRoutesOf(row);
  if (routes.length === 1 && routes[0] === target.slug) {
    return {
      matchedVia: "specific_drug",
      effectSlug: row.effect_slug ?? "specific-drug",
      substanceSlug: target.slug,
    };
  }

  const classes = titleDrugClassesOf(row);
  if (routes.length === 0 && classes.length === 1) {
    const drugClass = classes[0];
    const articleClass = GENERAL_CLASS_ARTICLE_LABEL[drugClass];
    if (
      (drugClass === "dissociatives" || drugClass === "deliriants")
      && articleClass
      && target.psychoactiveClasses.includes(articleClass)
    ) {
      return {
        matchedVia: "drug_class",
        effectSlug: drugClass,
        drugClass,
      };
    }
  }

  if (
    row.type === "image"
    && row.effect_slug === VISUAL_DISCONNECTION_EFFECT_SLUG
    && target.psychoactiveClasses.includes("Dissociative")
  ) {
    return {
      matchedVia: "visual_disconnection",
      effectSlug: VISUAL_DISCONNECTION_EFFECT_SLUG,
      drugClass: "dissociatives",
    };
  }

  return null;
}

/**
 * Derive the automatic pool. Exact substance work precedes class-general
 * work; eligible Visual Disconnection stills close the automatic pool.
 * Videos precede images inside the specific and class-general tiers.
 */
export function matchSubstanceGalleryReplications<Row extends SubstanceGalleryMatchableRow>(
  rows: readonly Row[],
  target: SubstanceGalleryTarget,
): SubstanceGalleryMatchResult<Row> {
  const specificVideos: SubstanceGalleryMatch<Row>[] = [];
  const specificImages: SubstanceGalleryMatch<Row>[] = [];
  const classVideos: SubstanceGalleryMatch<Row>[] = [];
  const classImages: SubstanceGalleryMatch<Row>[] = [];
  const visualDisconnectionImages: SubstanceGalleryMatch<Row>[] = [];

  for (const row of rows) {
    const provenance = automaticProvenance(row, target);
    if (!provenance) continue;
    const match = { row, provenance };
    if (provenance.matchedVia === "specific_drug") {
      (row.type === "video" ? specificVideos : specificImages).push(match);
    } else if (provenance.matchedVia === "drug_class") {
      (row.type === "video" ? classVideos : classImages).push(match);
    } else {
      visualDisconnectionImages.push(match);
    }
  }

  return {
    matches: [
      ...specificVideos,
      ...specificImages,
      ...classVideos,
      ...classImages,
      ...visualDisconnectionImages,
    ],
  };
}

/**
 * One bucket of eligible corpus rows that share every input the automatic
 * policy looks at. The corpus collapses to a few hundred buckets, so a count
 * for any substance is derived without re-reading the rows.
 */
export type SubstanceGalleryMatchBucket = {
  /** The single title-drug route, when the row names exactly one. */
  route: string | null;
  /** The single permitted general class, when the row names no drug and one class. */
  drugClass: "dissociatives" | "deliriants" | null;
  /** A still image owned by Visual Disconnection. */
  visualDisconnection: boolean;
  count: number;
};

/** The eligible corpus reduced to policy buckets; read the corpus once, count for every article. */
export function substanceGalleryMatchDigest(
  rows: readonly SubstanceGalleryMatchableRow[],
): SubstanceGalleryMatchBucket[] {
  const buckets = new Map<string, SubstanceGalleryMatchBucket>();
  for (const row of rows) {
    if (!isShowcaseEligible(row)) continue;
    const routes = titleDrugRoutesOf(row);
    const classes = titleDrugClassesOf(row);
    const route = routes.length === 1 ? routes[0] : null;
    const drugClass =
      routes.length === 0 && classes.length === 1 && classes[0] in GENERAL_CLASS_ARTICLE_LABEL
        ? (classes[0] as "dissociatives" | "deliriants")
        : null;
    const visualDisconnection =
      row.type === "image" && row.effect_slug === VISUAL_DISCONNECTION_EFFECT_SLUG;
    const key = `${route ?? ""}\u0000${drugClass ?? ""}\u0000${visualDisconnection ? 1 : 0}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
    } else {
      buckets.set(key, { route, drugClass, visualDisconnection, count: 1 });
    }
  }
  return [...buckets.values()];
}

/** `matchSubstanceGalleryReplications(rows, target).matches.length` from the digest of `rows`. */
export function countSubstanceGalleryMatches(
  digest: readonly SubstanceGalleryMatchBucket[],
  target: SubstanceGalleryTarget,
): number {
  let total = 0;
  for (const bucket of digest) {
    if (bucket.route !== null) {
      if (bucket.route === target.slug) total += bucket.count;
      else if (bucket.visualDisconnection && target.psychoactiveClasses.includes("Dissociative")) {
        total += bucket.count;
      }
      continue;
    }
    if (bucket.drugClass !== null) {
      const articleClass = GENERAL_CLASS_ARTICLE_LABEL[bucket.drugClass];
      if (articleClass && target.psychoactiveClasses.includes(articleClass)) {
        total += bucket.count;
        continue;
      }
    }
    if (bucket.visualDisconnection && target.psychoactiveClasses.includes("Dissociative")) {
      total += bucket.count;
    }
  }
  return total;
}

/**
 * Return direct-curation provenance for a stored manual association. Exclusion
 * preserves an association so editors can restore it later.
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

/** Add unmatched rows retained by a stored manual placement or exclusion. */
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

function automaticTier<Row extends SubstanceGalleryMatchableRow>(
  match: SubstanceGalleryMatch<Row>,
): number {
  if (match.provenance.matchedVia === "visual_disconnection") return 5;
  if (match.provenance.matchedVia === "curated") return 4;
  if (match.provenance.matchedVia === "specific_drug") {
    return match.row.type === "video" ? 0 : 1;
  }
  return match.row.type === "video" ? 2 : 3;
}

/**
 * Build the effective public order:
 *
 *  1. specific videos
 *  2. specific images
 *  3. permitted class-general videos
 *  4. permitted class-general images
 *  5. unmatched manual associations
 *  6. Visual Disconnection still-image fallback
 *
 * Existing curation orders rows within each tier. Newly tagged rows follow in
 * stable corpus order, so they appear automatically without destroying prior
 * editorial ordering. Suppression wins over every source.
 */
export function mergeCuratedGallery<Row extends SubstanceGalleryMatchableRow>(
  matchedItems: readonly SubstanceGalleryMatch<Row>[],
  curation: SubstanceGalleryCuration | null | undefined,
): SubstanceGalleryMatch<Row>[] {
  if (curation?.disabled) return [];
  const removed = new Set(curation?.removed_slugs ?? []);
  const bySlug = new Map<string, SubstanceGalleryMatch<Row>>();
  for (const item of matchedItems) {
    if (removed.has(item.row.slug) || bySlug.has(item.row.slug)) continue;
    bySlug.set(item.row.slug, item);
  }

  const curatedOrder = new Map(
    (curation?.curated_slugs ?? []).map((slug, index) => [slug, index]),
  );
  const automatic = [...bySlug.values()].sort((left, right) => {
    const tierDelta = automaticTier(left) - automaticTier(right);
    if (tierDelta !== 0) return tierDelta;
    const leftOrder = curatedOrder.get(left.row.slug);
    const rightOrder = curatedOrder.get(right.row.slug);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1;
      if (rightOrder === undefined) return -1;
      return leftOrder - rightOrder;
    }
    return 0;
  });
  return applyCuratedOrder(
    automatic,
    curation?.carousel_order,
    (item) => item.row.slug,
  );
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

export function normalizeGalleryCarouselOrder(
  slugs: readonly string[],
  includedSlugs: ReadonlySet<string>,
): { order: string[]; pruned: string[] } {
  const normalized = normalizeSlugList(slugs);
  return {
    order: normalized.filter((slug) => includedSlugs.has(slug)),
    pruned: normalized.filter((slug) => !includedSlugs.has(slug)),
  };
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
