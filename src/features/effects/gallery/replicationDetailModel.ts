import type { ReplicationWithUrl } from '@/types/replications';
import { applyCuratedOrder } from '@server/curatedOrder';
import { sortWithinGroup } from './galleryModel';

/**
 * Ordering for the replication surfaces (article galleries, contributor rails,
 * the permalink viewer's walk). Kept framework-free so the order is unit-tested
 * rather than inferred from the rendered page.
 *
 * Walk selection for the permalink viewer lives in
 * `@/features/replications/viewer/viewerModel`; only the orderings are shared
 * from here because each surface applies the same curated-then-fallback sort.
 */

/**
 * Order an effect's replications the way its article gallery does: every slug
 * named by `gallery_order` is an exact leading prefix, even across media ranks.
 * Unlisted works retain the shared audio-first, newest/title fallback.
 */
export function orderEffectReplications(
  replications: readonly ReplicationWithUrl[],
  galleryOrder?: readonly string[],
): ReplicationWithUrl[] {
  const automatic = sortWithinGroup(
    replications.filter((replication) => Boolean(replication.url)),
  );
  return applyCuratedOrder(
    automatic,
    galleryOrder,
    (replication) => replication.slug,
  );
}

/**
 * Order one contributor's works. Their explicit `replicationOrder` is the
 * authoritative prefix; the shared automatic order carries every unlisted work.
 */
export function orderContributorReplications(
  replications: readonly ReplicationWithUrl[],
  contributorOrder?: readonly string[],
): ReplicationWithUrl[] {
  return applyCuratedOrder(
    orderEffectReplications(replications),
    contributorOrder,
    (replication) => replication.slug,
  );
}

/**
 * Float a contributor's curated works to the front of an already-ordered set.
 *
 * "Featured" is not a column on `replications` — it is the editorial list in
 * `src/data/config/effectIndexFeaturedReplications.json`, so membership is a
 * slug lookup and nothing else. Matching is `Set.has` on the slug precisely so
 * this never becomes a second place that decides what a name or a work "really
 * is".
 *
 * The partition is stable: both groups keep the order they arrived in, so this
 * only ever moves the curated works forward and leaves every other pair in
 * place. With no matches it returns the input order unchanged, which is the
 * common case — only 36 works are curated across the whole corpus and most
 * contributors hold none.
 *
 * Applied to the profile rail, not to the permalink's prev/next walk. A rail is
 * entered at its front, so leading with the strongest pieces is what the reader
 * sees first; the walk is entered at whichever work was linked, where the same
 * reordering would only split the artist's set into two runs with a
 * discontinuity in the middle.
 */
export function orderContributorWorksFeaturedFirst<T extends { slug: string }>(
  works: readonly T[],
  featuredSlugs: readonly string[],
): T[] {
  if (featuredSlugs.length === 0) {
    return [...works];
  }

  const featured = new Set(featuredSlugs);
  const lead: T[] = [];
  const rest: T[] = [];

  for (const work of works) {
    (featured.has(work.slug) ? lead : rest).push(work);
  }

  return [...lead, ...rest];
}

