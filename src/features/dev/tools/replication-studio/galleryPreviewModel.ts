import {
  getCreatorByline,
  hasKnownCreator,
} from "@/features/effects/components/replicationCredit";
import type { ShowcaseWork } from "@/features/replications/components/showcaseWork";
import type { GalleryMatch } from "./substanceGalleryPortalModel";
import { sortByMediaRank } from "@/features/replications/mediaRank";

export function previewWorksFromMatches(
  matches: readonly GalleryMatch[],
): ShowcaseWork[] {
  const works: ShowcaseWork[] = [];
  for (const { replication, provenance } of sortByMediaRank(
    matches,
    (match) => match.replication,
  )) {
    if (replication.type !== "video" && replication.type !== "image") continue;
    works.push({
      slug: replication.slug,
      title: replication.title,
      type: replication.type,
      url: replication.url ?? "",
      thumbnailUrl: replication.thumbnail_url ?? undefined,
      byline: getCreatorByline(replication),
      artistName: hasKnownCreator(replication.artist)
        ? replication.artist.trim()
        : null,
      artistHref: null,
      artistHrefExternal: false,
      effectSlug: provenance.effectSlug,
      effectName:
        provenance.effectName || provenance.effectSlug.replace(/-/g, " "),
    });
  }
  return works;
}
