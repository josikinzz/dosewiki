import type { ContributorDirectory } from "@server/contributorDirectory";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import {
  artistIdentity,
  artistUrlKey,
  effectHrefBuilder,
  effectNameLookup,
  galleryGroupUrlKey,
  isDisplayable,
  isWithheldFromArtistViews,
  UNATTRIBUTED_KEY,
} from "@/features/effects/gallery/galleryArtistIdentity";
import {
  groupByArtist,
  groupByEffect,
} from "@/features/effects/gallery/galleryModel";
import type { GalleryGroup } from "@/features/effects/gallery/galleryTypes";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import type { GalleryFocus } from "./galleryUrlState";

/**
 * A focus URL resolved against the visible gallery corpus. `group.href` is the
 * Artist Page for a known artist and the effect article for an effect —
 * exactly what the group's heading links to in browse mode.
 */
export interface ResolvedGalleryFocus {
  kind: GalleryFocus["kind"];
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
 * The canonical redirect target for an Artist Page request. Source-era handle
 * URLs remain valid inputs, but a claimed profile's display-name key is the
 * only indexable destination.
 */
export function canonicalArtistPageRedirectKey(
  requestedKey: string,
  focus: Pick<ResolvedGalleryFocus, "key">,
): string | null {
  return artistUrlKey(requestedKey) === focus.key ? null : focus.key;
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
  replications: readonly PublicGalleryReplicationPreview[],
  context: GalleryFocusContext,
): ResolvedGalleryFocus | null {
  const displayable = replications.filter(isDisplayable);

  const groups =
    focus.kind === "artist"
      ? groupByArtist(displayable, context.contributorDirectory ?? [])
      : groupByEffect(
          displayable,
          effectNameLookup(context.effects),
          effectHrefBuilder(
            context.effectHrefPrefix,
            new Set(context.effects.map(({ slug }) => slug)),
          ),
        );

  const directGroup = groups.find(
    (candidate) => galleryGroupUrlKey(focus.kind, candidate) === focus.key,
  );
  if (focus.kind !== "artist") {
    if (!directGroup) {
      return null;
    }
    return {
      kind: focus.kind,
      key: focus.key,
      label: directGroup.label,
      group: directGroup,
    };
  }

  // A merged/renamed contributor can own several immutable source-era credit
  // lines. `groupByArtist` already folds every credit a Contributor Profile
  // claims into one group addressed by the profile's display name, so the
  // canonical key resolves directly. A retired handle's address still names a
  // credit line inside that group (`creditKeys`), and forwards to it; the
  // work `artist` strings themselves are never rewritten.
  const group =
    directGroup ??
    groups.find((candidate) => candidate.creditKeys?.includes(focus.key));
  if (!group) {
    return null;
  }
  const key = galleryGroupUrlKey("artist", group);
  return { kind: focus.kind, key, label: group.label, group };
}

/**
 * THE ARTIST PAGE ADDRESS DECISION (Replication Surfaces T-4).
 *
 * Every credited artist has exactly one public surface, and it lives at
 * /replications/artist/<key> — the Gallery Focus View address — decorated
 * with avatar, bio, and links when a Contributor Profile claims the credit
 * line. /contributors/<profileKey> permanently forwards here whenever the
 * profile claims a credited artist with displayable works.
 *
 * Why this address won:
 *
 *  - Key space. Unclaimed artists derive their key from the work credit;
 *    claimed artists use the claiming profile's canonical display-name key,
 *    with source-era credit keys forwarding to it. `unknown` remains the
 *    Unattributed bucket. This addresses claimed, unclaimed, and Unattributed
 *    artists alike without allowing a retired handle to become canonical just
 *    because it has the largest historical work bucket.
 *  - Collections. The Artist Page is the stable source beneath the shared
 *    viewer, so each work opens with `?viewer=<slug>` and Close returns here.
 *  - Inbound links survive either way. Both address families are emitted
 *    internally (profile links from bylines and credit lines, artist links
 *    from rails and focus URLs). Under a permanent redirect neither family
 *    breaks — but only this direction
 *    leaves zero live duplicates, because a work-less contributor's profile
 *    (a reviewer, an article author) is not an artist surface and simply
 *    keeps rendering at /contributors/<key>.
 */

/**
 * The canonical Artist Page href for one credited work, or `null` when the
 * work cannot prove such a page exists: an unattributed credit (the bucket
 * page never claims a byline) or a work withheld from artist views (its
 * artist may hold nothing else, in which case the route 404s). Callers keep
 * their contributor-profile fallback for the withheld case — a profile that
 * survives the merge is exactly one whose artist has no page here.
 */
export function artistPageHrefForWork(
  row: Pick<PublicGalleryReplicationPreview, "artist" | "effect_slug">,
): string | null {
  if (!hasKnownCreator(row.artist) || isWithheldFromArtistViews(row)) {
    return null;
  }
  return getPublicRoutePath({
    family: "replicationArtist",
    params: { key: artistUrlKey(row.artist) },
  });
}

/**
 * The profile key that decorates an artist group's page, or `null` for an
 * unclaimed credit line. The Unattributed bucket never resolves: it is not a
 * credit line anybody is stored under, and its page carries no identity
 * claims by design. Matching goes through the shared alias-aware matcher, so
 * the decoration and the heading link can never disagree about which profile
 * a credit belongs to.
 */
export function resolveArtistPageProfileKey(
  group: Pick<GalleryGroup, "key" | "label">,
  contributorDirectory: ContributorDirectory,
): string | null {
  if (group.key === UNATTRIBUTED_KEY) {
    return null;
  }
  return (
    findContributorProfileByAuthorName(contributorDirectory, group.label)
      ?.key ?? null
  );
}


/**
 * Which Artist Page each Contributor Profile forwards to: uppercase profile
 * key → artist URL key, for every profile that claims a credit line with at
 * least one displayable, non-withheld work. Profiles absent from the map have
 * no artist surface and keep rendering their contributor page.
 *
 * A profile claimed by several distinct source-era credit lines forwards to
 * the Artist Page named by its canonical display name. That page unions the
 * exact claimed buckets on read; the underlying work credits stay untouched.
 */
export function mapArtistPageKeysByProfile(
  // Structural rather than a Pick: the sitemap route plan carries a narrower
  // row (every field optional) than the gallery preview does.
  replications: readonly {
    artist?: string | null;
    effect_slug?: string;
    url?: string | null;
  }[],
  contributorDirectory: ContributorDirectory,
): Map<string, string> {
  const groups = new Map<string, { label: string; count: number }>();
  for (const row of replications) {
    if (!row.url || isWithheldFromArtistViews(row)) {
      continue;
    }
    const { key, label } = artistIdentity(row.artist);
    if (key === UNATTRIBUTED_KEY) {
      continue;
    }
    const group = groups.get(key);
    if (group) {
      group.count += 1;
    } else {
      groups.set(key, { label, count: 1 });
    }
  }

  const targets = new Map<string, string>();
  for (const { label } of groups.values()) {
    const profile = findContributorProfileByAuthorName(
      contributorDirectory,
      label,
    );
    if (!profile) {
      continue;
    }
    const profileKey = profile.key.trim().toUpperCase();
    targets.set(profileKey, artistUrlKey(profile.displayName));
  }

  return targets;
}
