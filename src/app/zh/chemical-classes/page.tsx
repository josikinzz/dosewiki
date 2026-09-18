import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadChemicalClassTreeRoute } from "@server/next/routeLoaders.chemicalClasses";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { ChemicalClassTreePage } from "@/features/chemical-classes/pages/ChemicalClassTreePage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  const result = await loadChemicalClassTreeRoute();

  return buildPublicPageMetadata({
    title: result.metadata.title,
    description: t(result.metadata.description, result.metadata.values),
    route: result.canonicalRoute,
    noIndex: true,
    socialImage: pageSocialCardImage("chemical-classes", "dose.wiki Chemical Class Index"),
  });
}

export default async function LocalizedChemicalClassesPage() {
  setRequestLocale(LOCALE.code);
  const result = await loadChemicalClassTreeRoute();

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ChemicalClassTreePage payload={result.payload} />
      </div>
    </UiLocaleProvider>
  );
}
