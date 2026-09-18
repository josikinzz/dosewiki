/**
 * The Simplified Chinese mirror of `/effects/group/[groupSlug]`, reached only
 * through the middleware rewrite from `zh.dose.wiki/effects/group/<slug>`.
 * Same index component opened on the tab the slug names; the mirror carries
 * `noindex` with a canonical link back to the English view.
 */
import { notFound } from "next/navigation";

import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import {
  EFFECT_INDEX_VIEW_PARAMS,
  effectIndexViewFromSlug,
  effectIndexViewPath,
} from "@/utils/indexViewRoutes";
import {
  EffectsIndexRoute,
  getEffectsIndexMetadata,
} from "../../../../effects/_components/EffectsIndexRoute";

export const revalidate = 3600;
export const dynamicParams = false;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export function generateStaticParams() {
  return EFFECT_INDEX_VIEW_PARAMS.map(({ slug }) => ({ groupSlug: slug }));
}

type LocalizedEffectGroupPageProps = {
  params: Promise<{ groupSlug: string }>;
};

export async function generateMetadata({ params }: LocalizedEffectGroupPageProps) {
  setRequestLocale(LOCALE.code);
  const { groupSlug } = await params;
  const initialView = effectIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  const englishPathname = effectIndexViewPath(initialView);
  return getEffectsIndexMetadata(englishPathname, {
    noIndex: true,
    canonicalPathname: englishPathname,
    locale: LOCALE,
  });
}

export default async function LocalizedEffectGroupPage({ params }: LocalizedEffectGroupPageProps) {
  setRequestLocale(LOCALE.code);
  const { groupSlug } = await params;
  const initialView = effectIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  const englishPathname = effectIndexViewPath(initialView);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <EffectsIndexRoute
          initialView={initialView}
          pathname={englishPathname}
          locale={LOCALE}
        />
      </div>
    </UiLocaleProvider>
  );
}
