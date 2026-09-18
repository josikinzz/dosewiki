/**
 * The mirror host's 404. The middleware rewrites every mirror-host path
 * outside the public corpus here with a 404 status, so the page renders the
 * not-found chrome in the mirror's language as ordinary server output. It is
 * a page rather than a `not-found.tsx` boundary because a nested boundary
 * only renders on the client (the server ships an empty error shell), and
 * the root boundary cannot read the request: Next renders it inside every
 * static route's tree, so a `headers()` call there flips ISR articles dynamic
 * at runtime and crashes them.
 */
import { getCopyByKeys } from "@server/next/copyBlocks";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { getStatusRecoveryLink } from "@server/next/statusRecoveryLinks";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { NotFoundBody } from "../../../_components/NotFoundBody";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

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
