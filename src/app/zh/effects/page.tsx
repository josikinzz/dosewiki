/**
 * The Simplified Chinese mirror of `/effects`, reached only through the
 * middleware rewrite from `zh.dose.wiki/effects`. Same index component; the
 * mirror carries `noindex` with a canonical link back to the English index,
 * and effect names render through the frozen-glossary catalog with English
 * fallbacks.
 */
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { EFFECT_INDEX_DEFAULT_VIEW, effectIndexViewPath } from "@/utils/indexViewRoutes";
import {
  EffectsIndexRoute,
  getEffectsIndexMetadata,
} from "../../effects/_components/EffectsIndexRoute";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

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
