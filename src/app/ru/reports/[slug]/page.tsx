import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadReportRoute } from "@server/next/routeLoaders.reports";
import { getStaticReportParams } from "@server/next/staticParams";
import { TripReportDetailPage } from "@/features/reports/pages/TripReportDetailPage";
import type { TripReportSubstance } from "@/types/tripReport";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return await getStaticReportParams();
}

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

function buildSubstanceLinks(
  substances: TripReportSubstance[],
  substanceBySlug: Record<string, { name: string }>,
): Record<string, string> {
  const links: Record<string, string> = {};
  for (const substance of substances) {
    const slug = slugify(substance.name);
    if (slug && substanceBySlug[slug]) {
      links[substance.name] = publicHref.substance(slug);
    }
  }
  return links;
}

type LocalizedReportPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: LocalizedReportPageProps) {
  const { slug } = await params;
  const result = await loadReportRoute(slug, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedReportPage({ params }: LocalizedReportPageProps) {
  setRequestLocale(LOCALE.code);
  const { slug } = await params;
  const result = await loadReportRoute(slug, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  const substanceLinks = buildSubstanceLinks(result.pageProps.report.substances, result.substanceBySlug);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <TripReportDetailPage
          {...result.pageProps}
          substanceBySlug={result.substanceBySlug}
          substanceLinks={substanceLinks}
        />
      </div>
    </UiLocaleProvider>
  );
}