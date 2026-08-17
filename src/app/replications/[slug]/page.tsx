import { permanentRedirect, notFound } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadReplicationRoute } from "@server/next/routeLoaders.replications";
import { getStaticReplicationParams } from "@server/next/staticParams";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationDetailPage } from "@/features/effects/pages/ReplicationDetailPage";
import { buildReplicationSchema, serializeJsonLd } from "@/utils/seo/structuredData";

export const revalidate = 3600;
// `false` for the reason documented on /blog/[slug]: with `dynamicParams = true`
// Next renders an unknown slug on demand and serves the `notFound()` body at
// HTTP 200, which is a soft 404 that search engines will index. These are
// permalinks carrying licence metadata, so a bogus one must be a real 404.
// The cost is that a replication uploaded after a build 404s until the next
// deploy, which is acceptable for a curated archive that changes rarely.
export const dynamicParams = false;

export async function generateStaticParams() {
  // Renamed slugs are deliberately absent: middleware redirects them before
  // routing (see getReplicationAliasRedirectUrl). Prerendering them here instead
  // produced a soft 404 — a prerendered `permanentRedirect()` renders the
  // not-found body at HTTP 200 rather than emitting a redirect.
  return await getStaticReplicationParams();
}

type ReplicationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ReplicationPageProps) {
  const { slug } = await params;
  const result = await loadReplicationRoute(slug);

  if (result.kind !== "ok") {
    return buildPublicPageMetadata({
      title: "Replication",
      description: `Browse subjective effect replications on ${SITE_FLAVOR_CONFIG.name}.`,
      route: result.kind === "redirect" ? result.canonicalRoute : { family: "replication", params: { slug } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ReplicationPage({ params }: ReplicationPageProps) {
  const { slug } = await params;
  const result = await loadReplicationRoute(slug);

  // A renamed slug is permanently gone: 301 so shared links and search results
  // settle on the new URL rather than being re-crawled forever.
  if (result.kind === "redirect") {
    permanentRedirect(result.target);
  }

  if (result.kind === "not-found") {
    notFound();
  }

  const { replication, effectName } = result.pageProps;
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const jsonLd = serializeJsonLd(
    buildReplicationSchema(
      {
        slug: replication.slug,
        title: replication.title,
        type: replication.type,
        contentUrl: replication.url,
        thumbnailUrl: replication.thumbnail_url,
        width: replication.width,
        height: replication.height,
        format: replication.format,
        durationSeconds: replication.duration,
        createdAt: replication.created_at,
        artist: replication.artist,
        artistUrl: replication.artist_url,
        creditLine: replication.credit_line,
        rightsholder: replication.rightsholder,
        licenseName: replication.license_name,
        licenseUrl: replication.license_url,
        effectName,
      },
      canonicalUrl,
    ),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <ReplicationDetailPage {...result.pageProps} />
    </>
  );
}
