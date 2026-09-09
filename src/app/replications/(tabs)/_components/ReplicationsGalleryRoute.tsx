import type { Metadata } from "next";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import {
  ARTIST_RAIL_PAGE,
  countGallery,
  groupByArtist,
  isDisplayable,
  isWithheldFromArtistViews,
  RAIL_PREVIEW_LIMIT,
  selectContributorDirectoryForWorks,
} from "@/features/effects/gallery/galleryModel";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import {
  buildItemListSchema,
  serializeJsonLd,
} from "@/utils/seo/structuredData";
import {
  getPublicContributorDirectory,
  getPublicEffects,
  getPublicGalleryReplicationBySlug,
  getPublicGalleryReplications,
} from "@server/convex/publicData";
import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";
import { replicationViewerSocialCardImage } from "@/data/mappings/entitySocialCardUrl";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

const ITEM_LIST_LIMIT = 100;

const DESCRIPTION_FALLBACK =
  "Browse the replication gallery: image and video recreations of the sensory experiences " +
  "produced by subjective effects, grouped by artist and effect.";

/**
 * The gallery index is served by two routes that render the same page:
 *
 *  - `/replications` — statically prerendered on the hourly ISR window shared
 *    by the other index pages. Its filters live in query params
 *    (?view/?q/?type/?sort) that only the client reads, so the HTML never
 *    varies on the URL and the route never touches `searchParams` (doing so
 *    would opt the whole route into per-request rendering).
 *  - `/replications/viewer/[slug]` — the middleware's rewrite target for a
 *    `?viewer=` deep-link *document* request. A shared immersive-view URL must
 *    unfurl with the active replication's social card, and that is the one
 *    piece of the page a static shell cannot vary; per-slug ISR keeps that cost
 *    to one render per shared work per window. Client-side navigations carry
 *    the `RSC` header and are never rewritten, so the explorer stays mounted
 *    across browse-state changes regardless of which route served the document.
 *
 * The prerendered body is the default artist view computed against the
 * complete corpus: the first rail page of artists in their true video-first
 * order, each rail carrying exactly its preview works, plus the archive's real
 * stats. After hydration the explorer fetches the complete corpus in one cached
 * request (on idle, or eagerly for deep links and filtered states).
 */
export async function getReplicationsGalleryMetadata(
  viewerSlug: string | null,
): Promise<Metadata> {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "Replications",
    description:
      copy.text("seo-replications-description") || DESCRIPTION_FALLBACK,
    route: { family: "replications" },
    socialImage:
      (viewerSlug ? replicationViewerSocialCardImage(viewerSlug) : undefined) ??
      pageSocialCardImage("replications", "dose.wiki Replications"),
  });
}

export async function ReplicationsGalleryRoute({
  viewerSlug,
}: {
  viewerSlug: string | null;
}) {
  const [corpus, effects, contributorDirectory, linkedReplication] = await Promise.all([
    getPublicGalleryReplications(),
    getPublicEffects(),
    getPublicContributorDirectory(),
    viewerSlug ? getPublicGalleryReplicationBySlug(viewerSlug) : null,
  ]);
  // The default artist view, computed against the complete corpus with the
  // exact model the client uses: the approved/video-first artist rail order,
  // newest work first inside each rail, withheld effects excluded. Only what
  // that view's first paint shows crosses into the RSC payload — the first
  // rail page of artists, each sliced to its rail preview — while the digest
  // and stats carry the complete-corpus ordering, per-artist counts, and
  // archive totals.
  const displayable = corpus.filter(isDisplayable);
  const artistGroups = groupByArtist(displayable, contributorDirectory);
  const railGroups = artistGroups.slice(0, ARTIST_RAIL_PAGE);
  const railWorks = railGroups.flatMap((group) =>
    group.items.slice(0, RAIL_PREVIEW_LIMIT),
  );
  const initialArtistRails = railGroups.map(
    ({ key, label, count, imageCount, videoCount }) => ({
      key,
      label,
      count,
      imageCount,
      videoCount,
    }),
  );
  const corpusStats = countGallery(
    displayable.filter((item) => !isWithheldFromArtistViews(item)),
  );
  // A linked work is one indexed lookup and joins the initial payload only
  // when it lies beyond the prerendered rails, so hydration never strips a
  // valid deep link prematurely.
  const initialReplications = linkedReplication && !railWorks.some(
    (replication) => replication._id === linkedReplication._id,
  )
    ? [...railWorks, linkedReplication]
    : railWorks;
  const galleryEffects = effects.map(({ slug, name }) => ({ slug, name }));
  const canonicalUrl = buildSiteUrl(
    getPublicRoutePath({ family: "replications" }),
  );
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: `${SITE_FLAVOR_CONFIG.name} replication gallery`,
      description:
        "Image and video replications of subjective effects, credited to the artists who made them.",
      items: railWorks.slice(0, ITEM_LIST_LIMIT).map((replication) => ({
        name: replication.title,
        url: buildSiteUrl(
          getPublicRoutePath({
            family: "replication",
            params: { slug: replication.slug },
          }),
        ),
      })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      {/* The archive states its size once, on the quiet row above the control
          bar, server-rendered from the same complete-corpus stats the explorer
          gets. It used to ride inside the control bar, where it cost 229px of
          the row the controls need for their labels and kept reciting the
          whole corpus while the reader looked at a filtered grid. */}
      <ReplicationsTabNav
        trailing={`${corpusStats.total.toLocaleString("en-US")} works · ${corpusStats.artists.toLocaleString("en-US")} artists · ${corpusStats.effects.toLocaleString("en-US")} effects`}
      />
      <ReplicationsGalleryExplorer
        replications={initialReplications}
        completeCorpusUrl="/api/replications/gallery"
        initialArtistRails={initialArtistRails}
        artistGroupTotal={artistGroups.length}
        corpusStats={corpusStats}
        effects={galleryEffects}
        contributorDirectory={selectContributorDirectoryForWorks(
          initialReplications,
          contributorDirectory,
        )}
        /* The index republishes 6,607 works by 2,117 named artists, so it
           states its own rights position: the fair-use notice moved to the
           More Info tab, which left this page with no credit or takedown path
           at any breakpoint in any state. */
        rightsFootnote
      />
    </>
  );
}
