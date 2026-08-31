import type { Metadata } from "next";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import { galleryContributorDirectory } from "@/features/replications/galleryFocus";
import {
  buildItemListSchema,
  serializeJsonLd,
} from "@/utils/seo/structuredData";
import {
  getPublicContributorDirectory,
  getPublicEffects,
  getPublicGalleryReplicationPage,
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
// immersive-view URL receives the active replication's social card. The
// prerendered body still contains the first bounded gallery page; readers can
// request additional cached pages after hydration.
export const revalidate = 3600;

const ITEM_LIST_LIMIT = 100;
const INITIAL_GALLERY_REPLICATION_LIMIT = 64;

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

export default async function ReplicationsPage() {
  const [galleryPage, effects, contributorDirectory] = await Promise.all([
    getPublicGalleryReplicationPage(
      undefined,
      INITIAL_GALLERY_REPLICATION_LIMIT,
    ),
    getPublicEffects(),
    getPublicContributorDirectory(),
  ]);
  const replications = galleryPage.items;

  // Directory entries are already a small public projection. Resolve them
  // against the complete corpus so deferred artists still receive their
  // curated ordering and avatar without shipping full contributor profiles.
  const galleryDirectory = galleryContributorDirectory(
    replications,
    contributorDirectory,
  );
  // The bounded first page is useful crawlable SSR content. Continuations
  // append to this same client corpus without replacing it.
  const initialReplications = replications;
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
      items: replications.slice(0, ITEM_LIST_LIMIT).map((replication) => ({
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
        deferredReplicationsUrl="/api/replications/gallery"
        continuationCursor={galleryPage.cursor}
        hasMoreReplications={!galleryPage.isDone}
        effects={galleryEffects}
        contributorDirectory={galleryDirectory}
        rightsFootnote={false}
      />
    </>
  );
}
