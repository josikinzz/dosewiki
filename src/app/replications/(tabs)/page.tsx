import type { Metadata } from "next";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import { galleryContributorDirectory } from "@/features/replications/galleryFocus";
import {
  groupByArtist,
  isDisplayable,
} from "@/features/effects/gallery/galleryModel";
import {
  buildItemListSchema,
  serializeJsonLd,
} from "@/utils/seo/structuredData";
import {
  getPublicContributorDirectory,
  getPublicEffects,
  getPublicGalleryReplications,
} from "@server/convex/publicData";
import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

// Statically rendered on the hourly ISR window shared by the other index
// pages. The gallery's filters live in query params (?view/?q/?type/?sort),
// but those are read on the client inside the explorer's own Suspense
// boundary. The prerendered HTML contains the initial default gallery window;
// a cached same-origin continuation supplies complete search/filter data after
// hydration. Every server read below sits on the shared cache window, and a
// Copy Studio save still revalidates the meta description through its tag.
export const revalidate = 3600;

const ITEM_LIST_LIMIT = 100;
const INITIAL_GALLERY_REPLICATION_LIMIT = 96;

const DESCRIPTION_FALLBACK =
  "Browse the replication gallery: image and video recreations of the sensory experiences " +
  "produced by subjective effects, grouped by artist and effect.";

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "Replications",
    description:
      copy.text("seo-replications-description") || DESCRIPTION_FALLBACK,
    route: { family: "replications" },
    socialImage: pageSocialCardImage("replications", "dose.wiki Replications"),
  });
}

export default async function ReplicationsPage() {
  const [replications, effects, contributorDirectory] = await Promise.all([
    getPublicGalleryReplications(),
    getPublicEffects(),
    getPublicContributorDirectory(),
  ]);

  // Directory entries are already a small public projection. Resolve them
  // against the complete corpus so deferred artists still receive their
  // curated ordering and avatar without shipping full contributor profiles.
  const galleryDirectory = galleryContributorDirectory(
    replications,
    contributorDirectory,
  );
  // Recreate the leading default artist rails instead of taking an arbitrary
  // storage-order slice. A descending per-rail budget keeps the full corpus's
  // artist order stable when the client groups this smaller window, while
  // retaining each leading rail's highest-ranked media.
  const initialReplications: typeof replications = [];
  const defaultArtistGroups = groupByArtist(
    replications.filter(isDisplayable),
    undefined,
    galleryDirectory,
  );
  const initialArtistGroupStats: Record<
    string,
    { count: number; imageCount: number; videoCount: number }
  > = {};
  let railPreviewBudget = 14;
  for (const group of defaultArtistGroups) {
    const remaining =
      INITIAL_GALLERY_REPLICATION_LIMIT - initialReplications.length;
    if (remaining <= 0) break;
    initialReplications.push(
      ...group.items.slice(
        0,
        Math.min(group.items.length, railPreviewBudget, remaining),
      ),
    );
    initialArtistGroupStats[group.key] = {
      count: group.count,
      imageCount: group.imageCount,
      videoCount: group.videoCount,
    };
    railPreviewBudget = Math.max(1, railPreviewBudget - 1);
  }
  if (initialReplications.length < INITIAL_GALLERY_REPLICATION_LIMIT) {
    const selectedIds = new Set(initialReplications.map((item) => item._id));
    for (const group of defaultArtistGroups) {
      for (const item of group.items) {
        if (initialReplications.length >= INITIAL_GALLERY_REPLICATION_LIMIT) {
          break;
        }
        if (selectedIds.has(item._id)) continue;
        selectedIds.add(item._id);
        initialReplications.push(item);
      }
      if (initialReplications.length >= INITIAL_GALLERY_REPLICATION_LIMIT) {
        break;
      }
    }
  }
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
        effects={galleryEffects}
        initialArtistGroupStats={initialArtistGroupStats}
        contributorDirectory={galleryDirectory}
        rightsFootnote={false}
      />
    </>
  );
}
