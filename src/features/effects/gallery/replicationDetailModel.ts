import type { ReplicationWithUrl } from '@/types/replications';
import { sortWithinGroup } from './galleryModel';

/**
 * Ordering and neighbour selection for the replication permalink
 * (`/replications/[slug]`). Kept framework-free so the walk order is unit-tested
 * rather than inferred from the rendered page.
 *
 * Prev/next deliberately walks the item's own effect in curated `gallery_order`
 * rather than whatever the visitor was browsing: the page is server-rendered and
 * shareable, so the sequence has to be identical for someone arriving cold from a
 * pasted link and someone who clicked through from the gallery.
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
