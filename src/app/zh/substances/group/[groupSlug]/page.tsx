/**
 * The Simplified Chinese mirror of `/substances/group/[groupSlug]`, reached
 * only through the middleware rewrite from `zh.dose.wiki/substances/group/<slug>`.
 * It opens the shared Substance Index on the requested class view and keeps the
 * English view as its canonical URL.
 */
import { notFound } from "next/navigation";

import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import {
  SUBSTANCE_INDEX_VIEW_PARAMS,
  substanceIndexViewFromSlug,
  substanceIndexViewPath,
} from "@/utils/indexViewRoutes";
import {
  getSubstancesIndexMetadata,
  SubstancesIndexRoute,
} from "../../../../substances/_components/SubstancesIndexRoute";

export const revalidate = 3600;
export const dynamicParams = false;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export function generateStaticParams() {
  return SUBSTANCE_INDEX_VIEW_PARAMS.map(({ slug }) => ({ groupSlug: slug }));
}

type LocalizedSubstanceGroupPageProps = {
  params: Promise<{ groupSlug: string }>;
};

export async function generateMetadata({ params }: LocalizedSubstanceGroupPageProps) {
  setRequestLocale(LOCALE.code);
  const { groupSlug } = await params;
  const initialView = substanceIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  const englishPathname = substanceIndexViewPath(initialView);
  return getSubstancesIndexMetadata(englishPathname, {
    noIndex: true,
    canonicalPathname: englishPathname,
  });
}

export default async function LocalizedSubstanceGroupPage({
  params,
}: LocalizedSubstanceGroupPageProps) {
  setRequestLocale(LOCALE.code);
  const { groupSlug } = await params;
  const initialView = substanceIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  const englishPathname = substanceIndexViewPath(initialView);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <SubstancesIndexRoute
          initialView={initialView}
          pathname={englishPathname}
        />
      </div>
    </UiLocaleProvider>
  );
}
