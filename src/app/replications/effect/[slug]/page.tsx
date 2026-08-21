import { notFound } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadEffectPlaylistRoute } from "@server/next/routeLoaders.replications";
import { getStaticReplicationEffectParams } from "@server/next/staticParams";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationDetailPage } from "@/features/effects/pages/ReplicationDetailPage";
import { publicHref } from "@/utils/publicHref";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";

/**
 * The effect playlist page: /replications/effect/<slug> opens the immersive
 * viewer at the effect's first work and walks the effect's whole gallery in
 * its curated order. The slug space derives from the works the gallery shows —
 * an effect with no visible replication is a real 404 here even when its
 * article exists. Like the permalink, this sits outside the `(tabs)` group: a
 * playlist is an immersive surface, not a section view, and gets no tab bar.
 *
 * Prerendered from the same gallery corpus the sitemap advertises and
 * revalidated hourly; an effect curated after the build resolves on demand.
 * Sharing this URL reproduces the same set and starting item for every
 * reader — the walk is chosen server-side from the address alone.
 */

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticReplicationEffectParams();
}

type EffectPlaylistPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: EffectPlaylistPageProps) {
  const { slug } = await params;
  const result = await loadEffectPlaylistRoute(slug);

  // Thrown here, not just in the page body: metadata resolves before the
  // response starts streaming, so this is what turns a bogus slug into a real
  // HTTP 404 instead of a soft 404 streamed into an already-committed 200.
  if (result.kind !== "ok") {
    notFound();
  }

  return buildPublicPageMetadata({
    title: `${result.metadata.title} | ${SITE_FLAVOR_CONFIG.name}`,
    description: result.metadata.description,
    route: result.canonicalRoute,
  });
}

export default async function ReplicationEffectPlaylistPage({ params }: EffectPlaylistPageProps) {
  const { slug } = await params;
  const result = await loadEffectPlaylistRoute(slug);

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
        setParam={{ kind: "effect", slug }}
      />
    </>
  );
}
