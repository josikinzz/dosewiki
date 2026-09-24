/**
 * The Russian mirror of `/glossary`, reached only through the
 * middleware rewrite from `ru.dose.wiki/glossary`. Same definitions as the
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
import { getGlossaryUsages } from "@server/translation/glossaryUsage";
import { getPublicTranslationCredits } from "@server/data/publicData";
import { TranslationCredits } from "@/features/language-glossary/TranslationCredits";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

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
  const [glosses, renderings, credits] = await Promise.all([
    readGlosses(),
    readGlossaryRows(LOCALE.code, { status: "approved" }),
    getPublicTranslationCredits(LOCALE.code),
  ]);
  const groups = buildGlossaryGroups(glosses, renderings);
  const usages = await getGlossaryUsages(groups.flatMap((group) => group.entries.map((entry) => entry.term)));

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <GlossaryContentPage
          groups={groups}
          usages={usages}
          renderingLang={LOCALE.htmlLang}
          credits={<TranslationCredits className="mb-8" title={t("translationCredits.title")} credits={credits} />}
        />
      </div>
    </UiLocaleProvider>
  );
}
