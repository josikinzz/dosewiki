import "server-only";

import { groupByArtist } from "@/features/effects/gallery/galleryModel";
import {
  effectNameLookup,
  isDisplayable,
  isWithheldFromArtistViews,
} from "@/features/effects/gallery/galleryArtistIdentity";
import {
  viewerCollectionFromGalleryGroups,
  type ReplicationViewerCollection,
} from "@/features/replications/viewer/viewerModel";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import type { LiveLocale } from "./localeHostPolicy";
import {
  getGalleryBrowseIndex,
  type GalleryBrowseIndex,
} from "./galleryBrowseIndex";
import { getPublicGalleryReplicationBySlug } from "@server/data/publicData";
import { getLocalizedPublicGalleryReplicationBySlug } from "@server/translation/localizedRecords";

export type GalleryRouteBootstrap = {
  index: GalleryBrowseIndex;
  selected: PublicGalleryReplicationPreview | null;
  initialViewerCollection: ReplicationViewerCollection | null;
};

/**
 * Resolve the compact canonical membership and the selected full record in
 * parallel. Membership is authoritative: a full record alone never makes an
 * unpublished, duplicate, or artist-withheld work eligible for the default
 * gallery viewer.
 */
export async function getGalleryRouteBootstrap(
  viewerSlug: string,
  locale: LiveLocale | null,
): Promise<GalleryRouteBootstrap> {
  const language = locale?.code === "zh-Hans" ? "zh-Hans" : "en";
  const [index, selectedRecord] = await Promise.all([
    getGalleryBrowseIndex(language),
    locale
      ? getLocalizedPublicGalleryReplicationBySlug(viewerSlug, locale.code)
      : getPublicGalleryReplicationBySlug(viewerSlug),
  ]);
  const member = index.rows.find((row) => row.slug === viewerSlug);
  const selected =
    member &&
    selectedRecord &&
    isDisplayable(selectedRecord) &&
    !isWithheldFromArtistViews(member)
      ? selectedRecord
      : null;
  if (!selected) {
    return { index, selected: null, initialViewerCollection: null };
  }

  const groups = groupByArtist([selected], index.directory, "newest");
  const initialViewerCollection = viewerCollectionFromGalleryGroups(
    groups,
    "artist",
    "/replications",
    effectNameLookup(index.effects),
    () => null,
  );
  return {
    index,
    selected,
    initialViewerCollection: {
      ...initialViewerCollection,
      label: "Replication gallery",
    },
  };
}
