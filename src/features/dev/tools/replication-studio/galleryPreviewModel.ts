/**
 * Bridge between the curation portal's in-memory match rows and the public
 * Replication Showcase stage.
 *
 * The portal edits an order; the article renders it. Rather than approximate
 * that render with thumbnails, the portal mounts the real stage — which means
 * something has to speak `ShowcaseWork`. This adapter mirrors
 * `buildShowcaseWorks` field for field so what the editor sees is what the
 * article draws.
 */

import {
  getCreatorByline,
  hasKnownCreator,
} from "@/features/effects/components/replicationCredit";
import type { ShowcaseWork } from "@/features/replications/components/showcaseWork";
import type { GalleryMatch } from "./substanceGalleryPortalModel";
import { sortByMediaRank } from "@/features/replications/mediaRank";

/**
 * Adapt in-memory portal matches to the exact contract the public stage
 * consumes: the same audio-first media rank the public builder applies leads,
 * and the caller's effective order (curated head, then auto tail) survives
 * within each rank.
 *
 * Parity with `buildShowcaseWorks`: audio drops out because the stage cannot
 * draw it, the byline comes from the shared credit helper, and an effect slug
 * the article names nowhere falls back to the humanised-slug convention.
 *
 * Two deliberate divergences. `artistHref` is always null and
 * `artistHrefExternal` always false: the public builder resolves a
 * contributor profile (or the creator's own `artist_url`) for the byline link,
 * but the portal's match rows carry no `artist_url` and the dev preview has no
 * contributor index to resolve against. A dead byline link in a preview is a
 * smaller lie than a guessed destination, so the name renders as plain text.
 * And the studio read does not thread `has_audio`, so a sounded video previews
 * in the silent-motion rank — one rank low, never reordered within a rank.
 */
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
      // A row whose asset never resolved keeps its empty URL: the preview is
      // where an editor should discover broken media, not the article.
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
