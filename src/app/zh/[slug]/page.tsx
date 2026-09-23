/**
 * The Simplified Chinese mirror of `/[slug]`, reached only through the
 * middleware rewrite from `zh.dose.wiki/<slug>`. Same loader, same page
 * component; the difference is the record, which arrives with every stored
 * translation spliced in and English wherever a segment is not translated yet.
 *
 * The mirror is unlisted: `noindex`, and its canonical is the English article.
 */
import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { loadSubstanceMetadataRoute, loadSubstanceRoute } from "@server/next/routeLoaders.substances";
import { getStaticSubstanceParams } from "@server/next/staticParams";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { MachineTranslationNotice } from "@/features/article/components/MachineTranslationNotice";

export const revalidate = 3600;
export const dynamicParams = true;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

/**
 * The tiers this mirror prerenders are decided by resolvePrerenderPolicy
 * (lib/next/prerenderPolicy.ts) for the mirror's locale; every other article
 * renders on first request and stays in the hourly ISR cache.
 */
export async function generateStaticParams() {
  return await getStaticSubstanceParams(LOCALE.code);
}

type LocalizedSubstancePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: LocalizedSubstancePageProps) {
  const { slug } = await params;
  const result = await loadSubstanceMetadataRoute(slug, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedSubstancePage({ params }: LocalizedSubstancePageProps) {
  setRequestLocale(LOCALE.code);
  const { slug } = await params;
  const result = await loadSubstanceRoute(slug, LOCALE);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

  if (result.kind === "not-found") {
    notFound();
  }

  const englishUrl = buildSiteUrl(getPublicRoutePath({ family: "substance", params: { slug } }));

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        {result.publicRevision && (
          <meta name="dosewiki-public-revision" content={result.publicRevision} />
        )}
        <SubstanceArticlePage
          {...result.pageProps}
          warningBannerNotice={<MachineTranslationNotice locale={LOCALE.code} englishUrl={englishUrl} review={result.review} />}
        />
      </div>
    </UiLocaleProvider>
  );
}
