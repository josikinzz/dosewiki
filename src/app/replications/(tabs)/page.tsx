import type { Metadata } from "next";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import {
  ARTIST_RAIL_PAGE,
  countGallery,
  DEFAULT_GALLERY_ARTIST_SORT,
  groupByArtist,
  isDisplayable,
  isWithheldFromArtistViews,
  RAIL_PREVIEW_LIMIT,
} from "@/features/effects/gallery/galleryModel";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import { parseReplicationViewerSlug } from "@/features/replications/galleryUrlState";
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
import {
  replicationViewerSocialCardImage,
} from "@/data/mappings/entitySocialCardUrl";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

// The gallery data remains on the hourly cache window shared by the other
// index pages. Its filters live in query params (?view/?q/?type/?sort) and are
// read on the client inside the explorer's own Suspense boundary. `?viewer=`
// is the exception: metadata reads that value on the server so a shared
// immersive-view URL receives the active replication's social card.
//
// The prerendered body is the default artist view computed here against the
// complete corpus: the first rail page of artists in their true video-first
// order, each rail carrying exactly its preview works, plus the archive's
// real stats. After hydration the explorer fetches the complete corpus in one
// cached request (on idle, or eagerly for deep links and filtered states).
export const revalidate = 3600;

const ITEM_LIST_LIMIT = 100;

const DESCRIPTION_FALLBACK =
  "Browse the replication gallery: image and video recreations of the sensory experiences " +
  "produced by subjective effects, grouped by artist and effect.";

type ReplicationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: ReplicationsPageProps): Promise<Metadata> {
  const [copy, resolvedSearchParams] = await Promise.all([
    getCopy(),
    searchParams,
  ]);

  return buildPublicPageMetadata({
    title: "Replications",
    description:
      copy.text("seo-replications-description") || DESCRIPTION_FALLBACK,
    route: { family: "replications" },
    socialImage:
      replicationViewerSocialCardImage(resolvedSearchParams) ??
      pageSocialCardImage("replications", "dose.wiki Replications"),
  });
}

export default async function ReplicationsPage({ searchParams }: ReplicationsPageProps) {
  const resolvedSearchParams = await searchParams;
  const viewerParams = new URLSearchParams();
  const rawViewer = resolvedSearchParams.viewer;
  if (typeof rawViewer === "string") viewerParams.set("viewer", rawViewer);
  const viewerSlug = parseReplicationViewerSlug(viewerParams);
  const [corpus, effects, contributorDirectory, linkedReplication] = await Promise.all([
    getPublicGalleryReplications(),
    getPublicEffects(),
    getPublicContributorDirectory(),
    viewerSlug ? getPublicGalleryReplicationBySlug(viewerSlug) : null,
  ]);
  // The default artist view, computed against the complete corpus with the
  // exact model the client uses: video-first artist order, curated in-group
  // order, withheld effects excluded. Only what that view's first paint shows
  // crosses into the RSC payload — the first rail page of artists, each
  // sliced to its rail preview — while the digest and stats carry the
  // complete-corpus ordering, per-artist counts, and archive totals.
  const displayable = corpus.filter(isDisplayable);
  const artistGroups = groupByArtist(
    displayable,
    DEFAULT_GALLERY_ARTIST_SORT,
    contributorDirectory,
  );
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
      <ReplicationsTabNav />
      <ReplicationsGalleryExplorer
        replications={initialReplications}
        completeCorpusUrl="/api/replications/gallery"
        initialArtistRails={initialArtistRails}
        artistGroupTotal={artistGroups.length}
        corpusStats={corpusStats}
        effects={galleryEffects}
        contributorDirectory={contributorDirectory}
        rightsFootnote={false}
      />
    </>
  );
}
