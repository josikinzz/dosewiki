import type { ReplicationWithUrl } from '@/types/replications';
import { applyCuratedOrder } from '@server/curatedOrder';
import { sortWithinGroup } from './galleryModel';

/**
 * Ordering and neighbour selection for the replication permalink
 * (`/replications/[slug]`). Kept framework-free so the walk order is unit-tested
 * rather than inferred from the rendered page.
 *
 * Prev/next deliberately walks a set derived from the item itself rather than
 * whatever the visitor was browsing: the page is server-rendered and shareable,
 * so the sequence has to be identical for someone arriving cold from a pasted
 * link and someone who clicked through from the gallery.
 */

/** The slice of a sibling the prev/next control actually renders. */
export interface ReplicationNeighbor {
  slug: string;
  title: string;
  type: ReplicationWithUrl['type'];
  thumbnailUrl?: string;
}

export interface ReplicationNeighbors {
  previous: ReplicationNeighbor | null;
  next: ReplicationNeighbor | null;
  /** 1-based position of the active item, or 0 when it is not in the set. */
  position: number;
  total: number;
}

/**
 * Order an effect's replications the way its article gallery does: curated
 * `gallery_order` first, then the shared newest/title fallback for anything the
 * curation does not mention.
 */
export function orderEffectReplications(
  replications: readonly ReplicationWithUrl[],
  galleryOrder?: readonly string[],
): ReplicationWithUrl[] {
  const displayable = replications.filter((replication) => Boolean(replication.url));

  if (!galleryOrder?.length) {
    return sortWithinGroup(displayable);
  }

  const rank = new Map(galleryOrder.map((slug, index) => [slug, index]));
  const curated: ReplicationWithUrl[] = [];
  const rest: ReplicationWithUrl[] = [];

  for (const replication of displayable) {
    if (rank.has(replication.slug)) curated.push(replication);
    else rest.push(replication);
  }

  curated.sort((a, b) => (rank.get(a.slug) ?? 0) - (rank.get(b.slug) ?? 0));

  return [...curated, ...sortWithinGroup(rest)];
}

/**
 * Order one contributor's works. Their body of work spans effects, so no single
 * effect's curated `gallery_order` governs it — the contributor's own
 * `replicationOrder` leads, and the shared newest-first sort carries the rest.
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

function toNeighbor(replication: ReplicationWithUrl): ReplicationNeighbor {
  return {
    slug: replication.slug,
    title: replication.title,
    type: replication.type,
    thumbnailUrl: replication.thumbnail_url ?? replication.url,
  };
}

/**
 * Neighbours of `slug` within an already-ordered set. The walk is finite, not
 * circular — wrapping around would make "next" from the last item silently
 * restart the effect, which reads as a bug on a permalink.
 */
export function selectReplicationNeighbors(
  ordered: readonly ReplicationWithUrl[],
  slug: string,
): ReplicationNeighbors {
  const index = ordered.findIndex((replication) => replication.slug === slug);

  if (index === -1) {
    return { previous: null, next: null, position: 0, total: ordered.length };
  }

  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index < ordered.length - 1 ? ordered[index + 1] : null;

  return {
    previous: previous ? toNeighbor(previous) : null,
    next: next ? toNeighbor(next) : null,
    position: index + 1,
    total: ordered.length,
  };
}

/** Which body of work the prev/next control is walking. */
export type ReplicationNeighborScope = 'artist' | 'effect';

export interface ReplicationNeighborSet extends ReplicationNeighbors {
  scope: ReplicationNeighborScope;
  /**
   * The name of the set being walked — the artist under `artist`, the effect
   * under `effect`, `null` when the fallback set has no named subject either.
   * The nav renders its accessible name from this, so it has to describe the
   * set the reader actually moves through and not the one they might assume.
   */
  scopeLabel: string | null;
}

export interface ReplicationNeighborSetInput {
  slug: string;
  /**
   * The credited artist's other works, already resolved to a contributor
   * profile. A credit that resolves to no profile arrives here as an empty set,
   * because a profile is the only thing that turns a credit line into a body of
   * work — see `contributorMatchNames`.
   */
  artistWorks: readonly ReplicationWithUrl[];
  /** Display name of that artist, absent when the work is unattributed. */
  artistName: string | null;
  /**
   * The artist's own curated ordering (`contributorProfiles.replicationOrder`),
   * which governs the artist set only. The profile rail applies exactly this
   * list to exactly this set, so a walk that starts at a pinned work moves
   * through the pinned works in the order the rail shows them.
   */
  artistOrder?: readonly string[];
  effectWorks: readonly ReplicationWithUrl[];
  effectName: string | null;
  /** The effect's curated order, which governs the effect set only. */
  galleryOrder?: readonly string[];
}

/**
 * Pick the set the permalink's prev/next walks.
 *
 * An attributed work sits inside its maker's body of work first: someone who
 * arrives at one piece by an artist is far more likely to want the next piece by
 * that artist than the next recreation of the same effect by someone else. An
 * unattributed work has no such body — the "Unknown"/"various artists" markers
 * name no person — so it keeps the effect walk, which is the only grouping it
 * genuinely belongs to.
 *
 * The artist set also has to actually contain this work and have somewhere to
 * go; a lone piece would otherwise replace a usable effect walk with a dead one.
 */
export function selectReplicationNeighborSet({
  slug,
  artistWorks,
  artistName,
  artistOrder,
  effectWorks,
  effectName,
  galleryOrder,
}: ReplicationNeighborSetInput): ReplicationNeighborSet {
  if (artistName) {
    const byArtist = selectReplicationNeighbors(
      orderContributorReplications(artistWorks, artistOrder),
      slug,
    );

    if (byArtist.position > 0 && byArtist.total > 1) {
      return { ...byArtist, scope: 'artist', scopeLabel: artistName };
    }
  }

  const byEffect = selectReplicationNeighbors(
    orderEffectReplications(effectWorks, galleryOrder),
    slug,
  );

  return { ...byEffect, scope: 'effect', scopeLabel: effectName };
}
