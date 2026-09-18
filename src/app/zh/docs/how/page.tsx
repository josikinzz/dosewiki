import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import DocsHowPage, { generateMetadata as generateEnglishMetadata } from "../../../docs/how/page";

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  return generateEnglishMetadata();
}

export default async function LocalizedDocsHowPage() {
  setRequestLocale(LOCALE.code);
  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div data-source-language="en" data-target-language={LOCALE.htmlLang}>
        {await DocsHowPage()}
      </div>
    </UiLocaleProvider>
  );
}
