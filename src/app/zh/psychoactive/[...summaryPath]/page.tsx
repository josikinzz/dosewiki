import { notFound } from "next/navigation";

import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  loadPsychoactiveSummaryMetadataRoute,
  loadPsychoactiveSummaryRoute,
} from "@server/next/routeLoaders.substances";
import { PsychoactiveSummaryPage } from "@/features/psychoactive-summaries/PsychoactiveSummaryPage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedPsychoactiveSummaryPageProps = {
  params: Promise<{
    summaryPath: string[];
  }>;
};

export async function generateMetadata({ params }: LocalizedPsychoactiveSummaryPageProps) {
  setRequestLocale(LOCALE.code);
  const { summaryPath } = await params;
  const result = loadPsychoactiveSummaryMetadataRoute(summaryPath);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    title: result.metadata.title,
    description: t(result.metadata.description),
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedPsychoactiveSummaryPage({
  params,
}: LocalizedPsychoactiveSummaryPageProps) {
  setRequestLocale(LOCALE.code);
  const { summaryPath } = await params;
  const result = await loadPsychoactiveSummaryRoute(summaryPath, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <PsychoactiveSummaryPage {...result.pageProps} />
      </div>
    </UiLocaleProvider>
  );
}
