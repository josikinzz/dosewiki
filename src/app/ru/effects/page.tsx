import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { EFFECT_INDEX_DEFAULT_VIEW, effectIndexViewPath } from "@/utils/indexViewRoutes";
import {
  EffectsIndexRoute,
  getEffectsIndexMetadata,
} from "../../effects/_components/EffectsIndexRoute";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

const ENGLISH_PATHNAME = effectIndexViewPath(EFFECT_INDEX_DEFAULT_VIEW);

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  return getEffectsIndexMetadata(ENGLISH_PATHNAME, {
    noIndex: true,
    canonicalPathname: ENGLISH_PATHNAME,
    locale: LOCALE,
  });
}

export default async function LocalizedEffectsPage() {
  setRequestLocale(LOCALE.code);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <EffectsIndexRoute
          initialView={EFFECT_INDEX_DEFAULT_VIEW}
          pathname={ENGLISH_PATHNAME}
          locale={LOCALE}
        />
      </div>
    </UiLocaleProvider>  );
}
