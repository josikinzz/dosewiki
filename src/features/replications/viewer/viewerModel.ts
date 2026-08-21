import type { ReplicationWithUrl } from '@/types/replications';
import type { EffectCategoryLink } from '@/features/effects/pages/replicationSubject';
import {
  orderContributorReplications,
  orderEffectReplications,
} from '@/features/effects/gallery/replicationDetailModel';

/**
 * The walk the replication viewer moves through and how it is chosen.
 *
 * The entry context picks the playlist: a `?set=` param names the walk the
 * reader opted into (effect article → that effect, substance showcase → that
 * substance, artist listing → that artist), and a bare permalink — a pasted
 * link with no context — walks the work's own effect. The page is
 * server-rendered and shareable, so the scope-free sequence has to be
 * identical for everyone; scoped walks ride in the URL, which keeps those
 * sequences shareable too.
 */

/** Which body of work the viewer is walking. */
export type ReplicationViewerScope = 'artist' | 'effect' | 'substance';

export interface ReplicationViewerItem {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  effectCategories: EffectCategoryLink[];
  /**
   * The credited artist's Artist Page (their contributor profile only for a
   * work withheld from artist views), null when the credit names nobody.
   */
  artistProfileHref: string | null;
  /**
   * The claiming Contributor Profile's avatar, rendered beside the compact
   * byline; null when no profile claims the credit or the profile has none.
   */
  avatarUrl: string | null;
}

export interface ReplicationViewerSet {
  scope: ReplicationViewerScope;
  /**
   * The name of the set being walked — the artist under `artist`, the effect
   * under `effect`, the substance under `substance`, `null` when the fallback
   * set has no named subject either. The viewer renders its accessible name
   * from this, so it has to describe the set the reader actually moves through
   * and not the one they might assume.
   */
  scopeLabel: string | null;
  /** Full ordered walk; the active item is found by slug. */
  items: ReplicationViewerItem[];
}

export interface ReplicationViewerSetInput {
  slug: string;
  /**
   * The walk the caller asks for. A bare permalink asks for nothing and gets
   * the effect walk — the work's own grouping, true regardless of where the
   * reader came from. `artist` is opted into explicitly (an `?set=artist:`
   * URL, an artist playlist page); the old artist-preferred default is
   * retired.
   */
  scope?: Extract<ReplicationViewerScope, 'artist' | 'effect'>;
  /**
   * The artist's works backing an `artist` scope request. A credit that
   * resolves to no body of work arrives here as an empty set, and the effect
   * walk stands in.
   */
  artistWorks?: readonly ReplicationWithUrl[];
  /** Display name of that artist, absent when the work is unattributed. */
  artistName?: string | null;
  /**
   * The artist's own curated ordering (`contributorProfiles.replicationOrder`),
   * which governs the artist set only. The artist's listing applies exactly
   * this list to exactly this set, so a walk that starts at a pinned work
   * moves through the pinned works in the order that listing shows them.
   */
  artistOrder?: readonly string[];
  effectWorks: readonly ReplicationWithUrl[];
  effectName: string | null;
  /** The effect's curated order, which governs the effect set only. */
  galleryOrder?: readonly string[];
  /**
   * Maps a walk member to what the viewer renders. Injected because the fields
   * (effect names, profile links) come from reads the loader has already done;
   * the selection policy itself stays synchronous and unit-testable.
   */
  toItem: (replication: ReplicationWithUrl) => ReplicationViewerItem;
}

/**
 * Pick the set the viewer walks and return it whole, in order.
 *
 * The default is the effect walk: a bare shared link carries no browsing
 * context, and the work's own effect is the one grouping every replication
 * genuinely belongs to. An artist walk exists only when asked for (`scope:
 * 'artist'`), and even then it has to actually contain this work and have
 * somewhere to go; a lone piece would otherwise replace a usable effect walk
 * with a dead one.
 *
 * The walk is finite, not circular — wrapping around would make "next" from the
 * last item silently restart the set, which reads as a bug on a permalink.
 * The viewer enforces that by index, so the full ordered set is returned here
 * rather than a prev/next pair.
 */
export function selectReplicationViewerSet({
  slug,
  scope = 'effect',
  artistWorks = [],
  artistName,
  artistOrder,
  effectWorks,
  effectName,
  galleryOrder,
  toItem,
}: ReplicationViewerSetInput): ReplicationViewerSet {
  if (scope === 'artist' && artistName) {
    const byArtist = orderContributorReplications(artistWorks, artistOrder);

    if (byArtist.length > 1 && byArtist.some((work) => work.slug === slug)) {
      return {
        scope: 'artist',
        scopeLabel: artistName,
        items: byArtist.map(toItem),
      };
    }
  }

  return {
    scope: 'effect',
    scopeLabel: effectName,
    items: orderEffectReplications(effectWorks, galleryOrder).map(toItem),
  };
}

/** Index of `slug` in the walk, -1 when the active item is not in the set. */
export function findViewerIndex(set: ReplicationViewerSet, slug: string): number {
  return set.items.findIndex((item) => item.replication.slug === slug);
}

/**
 * Names the set the viewer moves through. "More by Chelsea Morgan" and "More
 * replications of Tracers" are different claims about where the reader is, so
 * this is built from the set that was actually chosen rather than from whichever
 * subject happens to be on the page.
 */
export function describeViewerSet(set: ReplicationViewerSet): string {
  if (!set.scopeLabel) {
    return 'More replications';
  }

  return set.scope === 'artist'
    ? `More by ${set.scopeLabel}`
    : `More replications of ${set.scopeLabel}`;
}
