import { Suspense } from "react";
import type { Metadata } from "next";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import {
  countGallery,
  selectContributorDirectoryForWorks,
} from "@/features/effects/gallery/galleryModel";
import {
  isDisplayable,
  isWithheldFromArtistViews,
} from "@/features/effects/gallery/galleryArtistIdentity";
import { ReplicationsGalleryExplorer } from "@/features/replications/ReplicationsGalleryExplorer";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import {
  buildItemListSchema,
  serializeJsonLd,
} from "@/utils/seo/structuredData";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import type { GalleryPagePayload } from "@/features/replications/galleryPage";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { msg, t } from "@/i18n/server";
import { replicationViewerSocialCardImage } from "@/data/mappings/entitySocialCardUrl";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";
import { getGalleryBrowseIndex } from "@server/next/galleryBrowseIndex";
import { getGalleryBrowsePage } from "@server/next/galleryBrowsePage";
import { GALLERY_BROWSE_DEFAULTS } from "@/features/replications/galleryUrlState";
import type { GalleryBrowseIndex } from "@server/next/galleryBrowseIndex";
import { getGalleryRouteBootstrap } from "@server/next/galleryRouteData";
import { GalleryViewerHost } from "@/features/replications/components/GalleryViewerHost";

const ITEM_LIST_LIMIT = 100;

const DESCRIPTION_FALLBACK = msg(
  "Browse the replication gallery: image and video recreations of the sensory experiences produced by subjective effects, grouped by artist and effect.",
);

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
 * stats. After hydration the explorer fetches bounded continuation pages and
 * complete grouping/filter metadata, never an idle full-corpus download.
 *
 * A locale mirror renders the same page over the localized corpus, so the
 * prerendered rails carry translated titles and effect names. Continuation
 * requests retain the same locale as the server-rendered page.
 */
export async function getReplicationsGalleryMetadata(
  viewerSlug: string | null,
  locale: LiveLocale | null = null,
): Promise<Metadata> {
  const copy = await getCopyByKeys(["seo-replications-description"]);

  return buildPublicPageMetadata({
    title: msg("Replications"),
    description:
      t(copy.text("seo-replications-description") || DESCRIPTION_FALLBACK),
    route: { family: "replications" },
    noIndex: locale !== null,
    socialImage:
      (viewerSlug ? replicationViewerSocialCardImage(viewerSlug) : undefined) ??
      pageSocialCardImage("replications", "dose.wiki Replications"),
  });
}

async function GalleryRouteContent({
  index,
  pagePromise,
  linkedReplication,
  locale,
}: {
  index: GalleryBrowseIndex;
  pagePromise: Promise<GalleryPagePayload>;
  linkedReplication: PublicGalleryReplicationPreview | null;
  locale: LiveLocale | null;
}) {
  const { rows: corpus, effects, directory: contributorDirectory } = index;
  const { data: railWorks, contributorDirectory: _pageDirectory, ...initialPage } =
    await pagePromise;
  const displayable = corpus.filter(isDisplayable);
  const corpusStats = countGallery(
    displayable.filter((item) => !isWithheldFromArtistViews(item)),
  );
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
      <ReplicationsTabNav
        trailing={t("{{works}} works · {{artists}} artists · {{effects}} effects", {
          works: corpusStats.total.toLocaleString("en-US"),
          artists: corpusStats.artists.toLocaleString("en-US"),
          effects: corpusStats.effects.toLocaleString("en-US"),
        })}
      />
      <ReplicationsGalleryExplorer
        replications={initialReplications}
        galleryPageUrl={locale ? `/api/replications/gallery?locale=${locale.code}` : "/api/replications/gallery"}
        initialPage={initialPage}
        corpusStats={corpusStats}
        effects={galleryEffects}
        contributorDirectory={selectContributorDirectoryForWorks(
          initialReplications,
          contributorDirectory,
        )}
        rightsFootnote
      />
    </>
  );
}

export async function ReplicationsGalleryRoute({
  viewerSlug,
  locale = null,
}: {
  viewerSlug: string | null;
  locale?: LiveLocale | null;
}) {
  const language = locale?.code === "zh-Hans" ? "zh-Hans" : "en";
  if (!viewerSlug) {
    const index = await getGalleryBrowseIndex(language);
    const pagePromise = getGalleryBrowsePage(index, language, GALLERY_BROWSE_DEFAULTS);
    return (
      <GalleryViewerHost initialCollection={null} initialSlug={null}>
        <GalleryRouteContent
          index={index}
          pagePromise={pagePromise}
          linkedReplication={null}
          locale={locale}
        />
      </GalleryViewerHost>
    );
  }

  const bootstrap = await getGalleryRouteBootstrap(viewerSlug, locale);
  const pagePromise = getGalleryBrowsePage(
    bootstrap.index,
    language,
    GALLERY_BROWSE_DEFAULTS,
    null,
    null,
    bootstrap.selected ? viewerSlug : null,
  );
  return (
    <GalleryViewerHost
      initialCollection={bootstrap.initialViewerCollection}
      initialSlug={bootstrap.selected ? viewerSlug : null}
    >
      <Suspense fallback={null}>
        <GalleryRouteContent
          index={bootstrap.index}
          pagePromise={pagePromise}
          linkedReplication={bootstrap.selected}
          locale={locale}
        />
      </Suspense>
    </GalleryViewerHost>
  );
}
