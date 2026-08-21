import type { Metadata } from "next";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import {
  getPublicContributorDirectory,
  getPublicEffects,
  getPublicGalleryReplications,
} from "@server/convex/publicData";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";

// Statically rendered on the hourly ISR window shared by the other index
// pages. The gallery's filters live in query params (?view/?q/?type/?sort),
// but those are read on the client inside the explorer's own Suspense
// boundary — the prerendered HTML is the full default gallery, and a pasted
// URL applies its filters as soon as the client render takes over. Every data
// read below sits on the shared `unstable_cache` window, and a Copy Studio
// save still revalidates the meta description through the shared copy tag.
export const revalidate = 3600;

const ITEM_LIST_LIMIT = 100;

const DESCRIPTION_FALLBACK =
  "Browse the replication gallery: image and video recreations of the sensory experiences " +
  "produced by subjective effects, grouped by artist and effect.";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: `Replications | ${SITE_FLAVOR_CONFIG.name}`,
    description: copy.text("seo-replications-description") || DESCRIPTION_FALLBACK,
    route: { family: "replications" },
  });
}

export default async function ReplicationsPage() {
  // The gallery's artist headings resolve to profile pages, and that resolution
  // needs the directory. Reading it here keeps the client gallery from fetching
  // anything itself.
  const [replications, effects, contributorDirectory] = await Promise.all([
    getPublicGalleryReplications(),
    getPublicEffects(),
    getPublicContributorDirectory(),
  ]);

  const canonicalUrl = buildSiteUrl(getPublicRoutePath({ family: "replications" }));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: `${SITE_FLAVOR_CONFIG.name} replication gallery`,
      description:
        "Image and video replications of subjective effects, credited to the artists who made them.",
      items: replications.slice(0, ITEM_LIST_LIMIT).map((replication) => ({
        name: replication.title,
        url: buildSiteUrl(
          getPublicRoutePath({ family: "replication", params: { slug: replication.slug } }),
        ),
      })),
    }),
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: itemListJsonLd }} />
      <ReplicationsGalleryExplorer
        replications={replications}
        effects={effects}
        contributorDirectory={contributorDirectory}
      />
    </>
  );
}
