import type { ReplicationWithUrl } from '@/types/replications';
import { applyCuratedOrder } from '@server/curatedOrder';
import { sortWithinGroup, sortWorksByDate } from './galleryOrdering';

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
 * Order one contributor's works: newest work first, nothing above the date.
 *
 * Shares `sortWorksByDate` with the gallery's artist rails so a profile and
 * the index agree. Unrenderable rows are dropped here rather than by the
 * caller, matching `orderEffectReplications`.
 */
export function orderContributorReplications(
  replications: readonly ReplicationWithUrl[],
): ReplicationWithUrl[] {
  return sortWorksByDate(
    replications.filter((replication) => Boolean(replication.url)),
  );
}


