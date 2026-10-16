import { getCopyByKeys } from "@server/next/copyBlocks";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { getStatusRecoveryLink } from "@server/next/statusRecoveryLinks";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { NotFoundBody } from "../../../_components/NotFoundBody";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

export default async function LocalizedNotFoundPage() {
  setRequestLocale(LOCALE.code);
  const copy = await getCopyByKeys(["not-found-title", "not-found-body"]);
  const substancesLink = getStatusRecoveryLink("substances");
  const effectsLink = getStatusRecoveryLink("effects");
  const reportsLink = getStatusRecoveryLink("reports");

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-6 py-20 focus:outline-none"
        >
          <NotFoundBody
            substancesHref={substancesLink.href}
            effectsHref={effectsLink.href}
            effectsLabel={effectsLink.label}
            reportsHref={reportsLink.href}
            reportsLabel={reportsLink.label}
            title={copy.text("not-found-title") || undefined}
            body={copy.text("not-found-body") || undefined}
          />
        </main>
      </div>
    </UiLocaleProvider>
  );
}
