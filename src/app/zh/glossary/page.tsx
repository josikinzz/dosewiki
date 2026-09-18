/**
 * The Simplified Chinese mirror of `/glossary`, reached only through the
 * middleware rewrite from `zh.dose.wiki/glossary`. Same definitions as the
 * English page, plus the mirror's approved rendering after each term; a term
 * with an approved rendering but no definition yet still lists. The mirror
 * carries `noindex` and a canonical link back to the English page.
 */
import { getDataBackend } from "@server/postgres/runtime/backend";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { readGlossaryRows } from "@server/translation/glossary";
import { readGlosses } from "@server/translation/glossaryGloss";
import { buildGlossaryGroups, GLOSSARY_INTRO, GlossaryPage as GlossaryContentPage } from "@/components/pages/GlossaryPage";
import { UiLocaleProvider } from "@/i18n/client";
import { msg } from "@/i18n/messages";
import { setRequestLocale, t } from "@/i18n/server";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  return buildPublicPageMetadata({
    title: t(msg("Glossary")),
    description: t(GLOSSARY_INTRO),
    route: { family: "glossary" },
    noIndex: true,
  });
}

export default async function LocalizedGlossaryPage() {
  setRequestLocale(LOCALE.code);
  getDataBackend();
  const [glosses, renderings] = await Promise.all([readGlosses(), readGlossaryRows(LOCALE.code, { status: "approved" })]);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <GlossaryContentPage groups={buildGlossaryGroups(glosses, renderings)} renderingLang={LOCALE.htmlLang} />
      </div>
    </UiLocaleProvider>
  );
}
