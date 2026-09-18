/**
 * The Simplified Chinese mirror of `/replications/[slug]`, reached only
 * through the middleware rewrite from `zh.dose.wiki/replications/<slug>`.
 * Same loader with the localized replication record spliced in; the mirror
 * carries `noindex` and a canonical link back to the English permalink.
 */
import { permanentRedirect, notFound } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadReplicationRoute } from "@server/next/routeLoaders.replications";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ReplicationDetailPage } from "@/features/effects/pages/ReplicationDetailPage";
import { buildReplicationSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedReplicationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: LocalizedReplicationPageProps) {
  const { slug } = await params;
  const result = await loadReplicationRoute(slug, LOCALE);

  if (result.kind !== "ok") {
    return buildPublicPageMetadata({
      title: "Replication",
      description: `Browse subjective effect replications on ${SITE_FLAVOR_CONFIG.name}.`,
      route: result.kind === "redirect" ? result.canonicalRoute : { family: "replication", params: { slug } },
      noIndex: true,
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    noIndex: true,
    socialImage: entitySocialCardImage(
      "replications",
      result.pageProps.replication.slug,
      `${result.pageProps.replication.title} replication card`,
    ),
  });
}

export default async function LocalizedReplicationPage({ params }: LocalizedReplicationPageProps) {
  setRequestLocale(LOCALE.code);
  const { slug } = await params;
  const result = await loadReplicationRoute(slug, LOCALE);

  // A renamed slug is permanently gone: 301 so shared links settle on the new
  // URL; the relative target keeps the reader on the mirror host.
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
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        <ReplicationDetailPage {...result.pageProps} />
      </div>
    </UiLocaleProvider>
  );
}
