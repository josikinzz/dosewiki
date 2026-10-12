import { notFound } from "next/navigation";
import { readGlosses } from "@server/translation/glossaryGloss";
import { readPublicLanguageGlossary } from "@server/translation/publicGlossary";
import { getGlossaryUsages } from "@server/translation/glossaryUsage";
import { getPublicTranslationCredits } from "@server/data/publicData";
import { uiCatalogFor } from "@/i18n/serverMessages";
import { UiLocaleProvider, UiMessagesProvider } from "@/i18n/client";
import { parseUiLocale } from "@/i18n/messages";
import { LanguageGlossaryPage } from "./LanguageGlossaryPage";
import { projectGlossary } from "./languageGlossary";

/** Shared route loader and renderer for the reference and every translation. */
export async function GlossaryRoute({ locale = "en" }: { locale?: string }) {
  if (locale === "en") {
    const entries = projectGlossary(await readGlosses(), []);
    const usages = await getGlossaryUsages(entries.map((entry) => entry.term));
    return (
      <LanguageGlossaryPage
        reference
        language={{
          code: "en",
          name: "English",
          nativeName: "English",
          direction: "ltr",
        }}
        entries={entries}
        usages={usages}
      />
    );
  }
  const [page, credits] = await Promise.all([
    readPublicLanguageGlossary(locale),
    getPublicTranslationCredits(locale),
  ]);
  if (!page) notFound();
  return (
    <UiMessagesProvider locale={locale} messages={uiCatalogFor(locale) ?? {}}>
      <UiLocaleProvider locale={parseUiLocale(locale)}>
        <div lang={locale} dir={page.language.direction}>
          <LanguageGlossaryPage {...page} credits={credits} />
        </div>
      </UiLocaleProvider>
    </UiMessagesProvider>
  );
}
