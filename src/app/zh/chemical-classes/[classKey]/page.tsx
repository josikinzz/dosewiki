import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  formatChemicalClassMetadataDescription,
  loadChemicalClassDetailRoute,
} from "@server/next/routeLoaders.chemicalClasses";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { ChemicalClassDetailPage } from "@/features/chemical-classes/pages/ChemicalClassDetailPage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";

export const revalidate = 3600;
export const dynamicParams = true;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedChemicalClassPageProps = {
  params: Promise<{
    classKey: string;
  }>;
};

// Keep the build bounded like the English route; published keys enter the ISR cache on first request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: LocalizedChemicalClassPageProps) {
  setRequestLocale(LOCALE.code);
  const { classKey } = await params;
  const result = await loadChemicalClassDetailRoute(classKey);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    title: result.metadata.title,
    description: formatChemicalClassMetadataDescription(
      t(result.metadata.description, result.metadata.values),
    ),
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedChemicalClassPage({
  params,
}: LocalizedChemicalClassPageProps) {
  setRequestLocale(LOCALE.code);
  const { classKey } = await params;
  const result = await loadChemicalClassDetailRoute(classKey);

  if (result.kind === "not-found") {
    notFound();
  }

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ChemicalClassDetailPage detail={result.detail} />
      </div>
    </UiLocaleProvider>
  );
}
