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

// Reading `searchParams` makes this page render per request: the gallery's
// filters live in query params (?view/?q/?type/?sort) and a pasted URL must
// come back with its state already in the HTML. Every data read below sits on
// the hourly `unstable_cache` window shared by the other index pages, so the
// per-request work is assembly, not Convex traffic; a Copy Studio save still
// revalidates the meta description immediately through the shared copy tag.
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

type ReplicationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReplicationsPage({ searchParams }: ReplicationsPageProps) {
  // Awaited before render so the route is request-rendered and the client
  // explorer's `useSearchParams` is served on the server — see the note above.
  await searchParams;
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
