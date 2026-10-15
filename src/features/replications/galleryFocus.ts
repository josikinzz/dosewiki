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

export interface ResolvedGalleryFocus {
  kind: GalleryFocus["kind"];
  key: string;
  label: string;
  group: GalleryGroup;
}

export interface GalleryFocusContext {
  effects: readonly { slug: string; name: string }[];
  contributorDirectory?: ContributorDirectory;
  effectHrefPrefix?: string;
}

export function canonicalArtistPageRedirectKey(
  requestedKey: string,
  focus: Pick<ResolvedGalleryFocus, "key">,
): string | null {
  return artistUrlKey(requestedKey) === focus.key ? null : focus.key;
}

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

  const group =
    directGroup ??
    groups.find((candidate) => candidate.creditKeys?.includes(focus.key));
  if (!group) {
    return null;
  }
  const key = galleryGroupUrlKey("artist", group);
  return { kind: focus.kind, key, label: group.label, group };
}

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

export function mapArtistPageKeysByProfile(
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
