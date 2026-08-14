import type { ContributorDirectory } from '@server/contributorDirectory';
import type { GalleryReplication } from '@/types/replications';
import {
  effectHrefBuilder,
  effectNameLookup,
  galleryGroupUrlKey,
  groupByArtist,
  groupByEffect,
  isDisplayable,
  type GalleryGroup,
  type GalleryMode,
} from '@/features/effects/gallery/galleryModel';
import type { GalleryFocus } from './galleryUrlState';

/**
 * A focus URL resolved against the visible gallery corpus. `group.href` is the
 * contributor profile for a known artist and the effect article for an effect
 * — exactly what the group's heading links to in browse mode.
 */
export interface ResolvedGalleryFocus {
  kind: GalleryMode;
  /** The canonical URL key this group answers to. */
  key: string;
  label: string;
  group: GalleryGroup;
}

export interface GalleryFocusContext {
  effects: readonly { slug: string; name: string }[];
  contributorDirectory?: ContributorDirectory;
  effectHrefPrefix?: string;
}

/**
 * Inverse of `galleryGroupUrlKey`: find the gallery group a focus URL names.
 * The URL space derives from the visible works — a key that no displayable
 * work produces (bogus, or an artist whose works are all hidden) resolves to
 * `null`, which the route turns into a 404. Runs on both sides of the
 * server/client boundary so the page's validation and the explorer's focused
 * view can never disagree about what a key means.
 */
export function resolveGalleryFocus(
  focus: GalleryFocus,
  replications: readonly GalleryReplication[],
  context: GalleryFocusContext,
): ResolvedGalleryFocus | null {
  const displayable = replications.filter(isDisplayable);

  const groups =
    focus.kind === 'artist'
      ? groupByArtist(displayable, 'count', context.contributorDirectory ?? [])
      : groupByEffect(
          displayable,
          effectNameLookup(context.effects),
          effectHrefBuilder(context.effectHrefPrefix),
        );

  const group = groups.find((candidate) => galleryGroupUrlKey(focus.kind, candidate) === focus.key);
  if (!group) {
    return null;
  }

  return { kind: focus.kind, key: focus.key, label: group.label, group };
}
