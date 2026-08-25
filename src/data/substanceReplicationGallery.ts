/**
 * Drug-association policy and editorial ordering for the per-substance
 * Replication Showcase (see CONTEXT.md → Replications Surface Language).
 *
 * Automatic placement is deliberately narrower than visual-effect matching:
 * a standalone drug mention belongs only to that drug, while a general
 * dissociative or deliriant work belongs to every article in that class.
 * General psychedelic work is never spread across psychedelic articles, and
 * combinations are never proposed for a single-substance showcase.
 *
 * Stored `curated_slugs` are an ordering/direct-association delta rather than a
 * publish gate. Automatic tiers lead; curation orders rows within a tier and
 * preserves unmatched editorial associations as the final tier.
 * `removed_slugs` always wins.
 *
 * Everything here is pure. Imports are relative because the Convex bundler
 * consumes this file through `convex/substanceGalleries.ts`.
 */

import { z } from "zod";
import {
  isPublishableReplication,
  type MediaRole,
  type ReplicationDrugClass,
  type ReplicationTitleDrug,
  type ReplicationType,
  type ReplicationWithUrl,
} from "../types/replications";

/**
 * The ceiling on either stored curation list. One home for a number the Convex
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

export type AutomaticSubstanceMatchKind = "specific_drug" | "drug_class";

/** How one corpus row earned its place in a substance's showcase. */
export type SubstanceGalleryMatchProvenance = {
  matchedVia: AutomaticSubstanceMatchKind | "curated";
  /** The owning effect remains the chip shown beside the work. */
  effectSlug: string;
  /** Present for a standalone title-drug placement. */
  substanceSlug?: string;
  /** Present for a permitted general-class placement. */
  drugClass?: "dissociatives" | "deliriants";
};

export type SubstanceGalleryTitleClassMention = {
  class: ReplicationDrugClass;
  matched_title_text: string;
};

/** The minimum a corpus row must carry to be matchable. */
export type SubstanceGalleryMatchableRow = {
  slug: string;
  type: ReplicationType;
  role?: MediaRole;
  effect_slug?: string | null;
  title_drugs?: ReplicationTitleDrug[];
  title_class_mentions?: SubstanceGalleryTitleClassMention[];
  /** Corpus-wide suppression: junk or a combination belongs on no drug article. */
  showcase_excluded?: boolean;
  replication_status?: "replication" | "not-replication" | "unclear" | "unreviewed" | "source-corrupt";
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
  /** Automatic candidates in specific-video, specific-image, class-video, class-image order. */
  matches: SubstanceGalleryMatch<Row>[];
};

/**
 * The stored gallery association fields: ordered manual priority/direct
 * placements and unordered per-substance exclusions.
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

/** Distinct article routes named by a row, preserving first-title-mention order. */
export function titleDrugRoutesOf(row: SubstanceGalleryMatchableRow): string[] {
  const routes: string[] = [];
  const seen = new Set<string>();
  for (const drug of row.title_drugs ?? []) {
    const route = canonicalTitleDrugRoute(drug.slug);
    if (!route || seen.has(route)) continue;
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

/**
 * A combination is either multiple distinct specific drugs or, when no drug is
 * named, multiple broad classes. Repeated aliases for one route (DPH/Benadryl,
 * DMT/dimethyltryptamine) remain one substance.
 *
 * `showcase_excluded` is a second, editorially reviewed guard for combinations
 * whose compact or credit-bearing titles defeated title extraction.
 */
export function isCombinationReplication(row: SubstanceGalleryMatchableRow): boolean {
  const routes = titleDrugRoutesOf(row);
  if (routes.length > 1) return true;
  return routes.length === 0 && titleDrugClassesOf(row).length > 1;
}

/** Corpus-wide eligibility shared by automatic and direct placement. */
export function isShowcaseEligible(row: SubstanceGalleryMatchableRow): boolean {
  return (
    isPublishableReplication(row)
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
  if (routes.length === 1) {
    if (routes[0] !== target.slug) return null;
    return {
      matchedVia: "specific_drug",
      effectSlug: row.effect_slug ?? "specific-drug",
      substanceSlug: target.slug,
    };
  }

  const classes = titleDrugClassesOf(row);
  if (classes.length !== 1) return null;
  const drugClass = classes[0];
  if (drugClass !== "dissociatives" && drugClass !== "deliriants") return null;
  const articleClass = GENERAL_CLASS_ARTICLE_LABEL[drugClass];
  if (!articleClass || !target.psychoactiveClasses.includes(articleClass)) return null;
  return {
    matchedVia: "drug_class",
    effectSlug: drugClass,
    drugClass,
  };
}

/**
 * Derive the automatic pool. Exact substance work always precedes the
 * permitted class-general pool; videos precede images inside both tiers.
 */
export function matchSubstanceGalleryReplications<Row extends SubstanceGalleryMatchableRow>(
  rows: readonly Row[],
  target: SubstanceGalleryTarget,
): SubstanceGalleryMatchResult<Row> {
  const specificVideos: SubstanceGalleryMatch<Row>[] = [];
  const specificImages: SubstanceGalleryMatch<Row>[] = [];
  const classVideos: SubstanceGalleryMatch<Row>[] = [];
  const classImages: SubstanceGalleryMatch<Row>[] = [];

  for (const row of rows) {
    const provenance = automaticProvenance(row, target);
    if (!provenance) continue;
    const match = { row, provenance };
    if (provenance.matchedVia === "specific_drug") {
      (row.type === "video" ? specificVideos : specificImages).push(match);
    } else {
      (row.type === "video" ? classVideos : classImages).push(match);
    }
  }

  return {
    matches: [
      ...specificVideos,
      ...specificImages,
      ...classVideos,
      ...classImages,
    ],
  };
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
 *
 * Existing curation orders rows within each tier. Newly tagged rows follow in
 * stable corpus order, so they appear automatically without destroying prior
 * editorial ordering. Suppression wins over every source.
 */
export function mergeCuratedGallery<Row extends SubstanceGalleryMatchableRow>(
  matchedItems: readonly SubstanceGalleryMatch<Row>[],
  curation: SubstanceGalleryCuration | null | undefined,
): SubstanceGalleryMatch<Row>[] {
  const removed = new Set(curation?.removed_slugs ?? []);
  const bySlug = new Map<string, SubstanceGalleryMatch<Row>>();
  for (const item of matchedItems) {
    if (removed.has(item.row.slug) || bySlug.has(item.row.slug)) continue;
    bySlug.set(item.row.slug, item);
  }

  const curatedOrder = new Map(
    (curation?.curated_slugs ?? []).map((slug, index) => [slug, index]),
  );
  return [...bySlug.values()].sort((left, right) => {
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
