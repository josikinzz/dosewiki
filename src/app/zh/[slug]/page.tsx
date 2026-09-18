/**
 * The Simplified Chinese mirror of `/[slug]`, reached only through the
 * middleware rewrite from `zh.dose.wiki/<slug>`. Same loader, same page
 * component; the difference is the record, which arrives with every stored
 * translation spliced in and English wherever a segment is not translated yet.
 *
 * The mirror is unlisted: `noindex`, and its canonical is the English article.
 */
import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { loadSubstanceMetadataRoute, loadSubstanceRoute } from "@server/next/routeLoaders.substances";
import { getStaticSubstanceParams } from "@server/next/staticParams";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { MachineTranslationNotice } from "./MachineTranslationNotice";

export const revalidate = 3600;
export const dynamicParams = true;

/**
 * The same tiers as the English `/[slug]`: the ISR cache does not survive a
 * deploy, so the high and normal priority articles are prerendered here too
 * and the low priority long tail renders on first request.
 */
export async function generateStaticParams() {
  return await getStaticSubstanceParams();
}

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

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

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        {result.publicRevision && (
          <meta name="dosewiki-public-revision" content={result.publicRevision} />
        )}
        <SubstanceArticlePage
          {...result.pageProps}
          warningBannerNotice={<MachineTranslationNotice slug={slug} />}
        />
      </div>
    </UiLocaleProvider>
  );
}
