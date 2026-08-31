import { permanentRedirect, notFound } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadReplicationRoute } from "@server/next/routeLoaders.replications";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationDetailPage } from "@/features/effects/pages/ReplicationDetailPage";
import { buildReplicationSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // The gallery and sitemap stay build-time rendered, but detail routes scale
  // with reader demand rather than archive size. A real slug is generated on
  // first request and then enters the hourly ISR cache.
  return [];
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
    socialImage: entitySocialCardImage(
      "replications",
      result.pageProps.replication.slug,
      `${result.pageProps.replication.title} replication card`,
    ),
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
