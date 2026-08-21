import type { ReplicationWithUrl } from '@/types/replications';
import type { EffectCategoryLink } from '@/features/effects/pages/replicationSubject';
import {
  orderContributorReplications,
  orderEffectReplications,
} from '@/features/effects/gallery/replicationDetailModel';

/**
 * The walk the replication viewer moves through and how it is chosen.
 *
 * The viewer deliberately walks a set derived from the item itself rather than
 * whatever the visitor was browsing: the page is server-rendered and shareable,
 * so the sequence has to be identical for someone arriving cold from a pasted
 * link and someone who clicked through from a gallery. The one exception —
 * substance scope — is opted into through the URL (`?set=substance:<slug>`),
 * which keeps that sequence shareable too.
 */

/** Which body of work the viewer is walking. */
export type ReplicationViewerScope = 'artist' | 'effect' | 'substance';

export interface ReplicationViewerItem {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  effectCategories: EffectCategoryLink[];
  /** Profile page of the credited artist, null when no profile claims them. */
  artistProfileHref: string | null;
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
 * An attributed work sits inside its maker's body of work first: someone who
 * arrives at one piece by an artist is far more likely to want the next piece by
 * that artist than the next recreation of the same effect by someone else. An
 * unattributed work has no such body — the "Unknown"/"various artists" markers
 * name no person — so it keeps the effect walk, which is the only grouping it
 * genuinely belongs to.
 *
 * The artist set also has to actually contain this work and have somewhere to
 * go; a lone piece would otherwise replace a usable effect walk with a dead one.
 *
 * The walk is finite, not circular — wrapping around would make "next" from the
 * last item silently restart the set, which reads as a bug on a permalink.
 * The viewer enforces that by index, so the full ordered set is returned here
 * rather than a prev/next pair.
 */
export function selectReplicationViewerSet({
  slug,
  artistWorks,
  artistName,
  artistOrder,
  effectWorks,
  effectName,
  galleryOrder,
  toItem,
}: ReplicationViewerSetInput): ReplicationViewerSet {
  if (artistName) {
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
