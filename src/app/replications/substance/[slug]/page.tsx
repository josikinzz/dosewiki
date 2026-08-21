import { notFound } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import {
  loadSubstancePlaylistRoute,
  loadSubstancePlaylistStaticParams,
} from "@server/next/routeLoaders.replications";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationDetailPage } from "@/features/effects/pages/ReplicationDetailPage";
import { publicHref } from "@/utils/publicHref";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";

/**
 * The substance playlist page: /replications/substance/<slug> opens the
 * immersive viewer at the substance's first showcased work and walks the same
 * curated gallery the article's Replication Showcase renders — the exact walk
 * the viewer's `?set=substance:` re-scope fetches, built by the same loader.
 * An uncurated or unknown substance has no walk and 404s honestly. Like the
 * permalink, this sits outside the `(tabs)` group: a playlist is an immersive
 * surface, not a section view, and gets no tab bar.
 *
 * Prerendered for every substance whose curated gallery holds a renderable
 * work and revalidated hourly; a substance curated after the build resolves
 * on demand. Sharing this URL reproduces the same set and starting item for
 * every reader — the walk is chosen server-side from the address alone.
 */

export const revalidate = 3600;

export async function generateStaticParams() {
  return await loadSubstancePlaylistStaticParams();
}

type SubstancePlaylistPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: SubstancePlaylistPageProps) {
  const { slug } = await params;
  const result = await loadSubstancePlaylistRoute(slug);

  // Thrown here, not just in the page body: metadata resolves before the
  // response starts streaming, so this is what turns an uncurated substance
  // into a real HTTP 404 instead of a soft 404 streamed into an
  // already-committed 200.
  if (result.kind !== "ok") {
    notFound();
  }

  return buildPublicPageMetadata({
    title: `${result.metadata.title} | ${SITE_FLAVOR_CONFIG.name}`,
    description: result.metadata.description,
    route: result.canonicalRoute,
  });
}

export default async function ReplicationSubstancePlaylistPage({
  params,
}: SubstancePlaylistPageProps) {
  const { slug } = await params;
  const result = await loadSubstancePlaylistRoute(slug);

  if (result.kind !== "ok") {
    notFound();
  }

  const { viewerSet } = result.pageProps;
  const first = viewerSet.items[0];
  if (!first) {
    notFound();
  }

  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const jsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: result.metadata.title,
      description: result.metadata.description,
      items: viewerSet.items.map((item) => ({
        name: item.replication.title,
        url: buildSiteUrl(publicHref.replication(item.replication.slug)),
      })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <ReplicationDetailPage
        replication={first.replication}
        effectName={first.effectName}
        effectSlug={first.effectSlug}
        artistProfileHref={first.artistProfileHref}
        avatarUrl={first.avatarUrl}
        effectCategories={first.effectCategories}
        viewerSet={viewerSet}
        setParam={{ kind: "substance", slug }}
      />
    </>
  );
}
