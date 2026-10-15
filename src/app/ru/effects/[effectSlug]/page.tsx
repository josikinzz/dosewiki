import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadEffectMetadataRoute, loadEffectRoute } from "@server/next/routeLoaders.substances";
import { EffectArticleServer } from "@/app/_components/public-routes/EffectArticleServer";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

type LocalizedEffectPageProps = {
  params: Promise<{
    effectSlug: string;
  }>;
};

export async function generateMetadata({ params }: LocalizedEffectPageProps) {
  const { effectSlug } = await params;
  const result = await loadEffectMetadataRoute(effectSlug, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedEffectPage({ params }: LocalizedEffectPageProps) {
  setRequestLocale(LOCALE.code);
  const { effectSlug } = await params;
  const result = await loadEffectRoute(effectSlug, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  const { sourceEffect: _sourceEffect, ...pageProps } = result.pageProps;

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <EffectArticleServer {...pageProps} effectSlug={effectSlug} />
      </div>
    </UiLocaleProvider>
  );
}