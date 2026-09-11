import type { Metadata } from "next";
import { headers } from "next/headers";
import { getCopy } from "@server/next/copyBlocks";
import { buildPageMetadata } from "@server/next/metadata";
import { getStatusRecoveryLink } from "@server/next/statusRedirectPolicy";
import { NotFoundBody } from "./_components/NotFoundBody";
import { UiLocaleProvider } from "@/i18n/client";
import { setRequestLocale } from "@/i18n/server";

// `not-found.tsx` takes a static `metadata` export — Next does not run
// `generateMetadata` for it — so the 404's SEO description stays in code while
// its on-page prose is editable below.
export const metadata: Metadata = buildPageMetadata({
  title: "Page not found",
  description: "The page you requested does not exist or may have moved.",
  pathname: "/404",
  noIndex: true,
});

const PAGE_CLASS = "mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-6 py-20 focus:outline-none";

export default async function NotFound() {
  const copy = await getCopy();
  const substancesLink = getStatusRecoveryLink("substances");
  const effectsLink = getStatusRecoveryLink("effects");
  const reportsLink = getStatusRecoveryLink("reports");

  // The middleware stamps mirror-host requests with their locale because this
  // route matches no localized page; without it the 404 chrome would stay
  // English on zh.dose.wiki. English hosts never carry the header.
  const mirrorLocale = (await headers()).get("x-dosewiki-mirror-locale");
  const body = (
    <NotFoundBody
      substancesHref={substancesLink.href}
      effectsHref={effectsLink.href}
      effectsLabel={effectsLink.label}
      reportsHref={reportsLink.href}
      reportsLabel={reportsLink.label}
      title={copy.text("not-found-title") || undefined}
      body={copy.text("not-found-body") || undefined}
    />
  );

  if (mirrorLocale !== "zh-Hans") {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className={PAGE_CLASS}
      >
        {body}
      </main>
    );
  }

  setRequestLocale("zh-Hans");

  return (
    <UiLocaleProvider locale="zh-Hans">
      <div lang="zh-Hans">
        <main
          id="main-content"
          tabIndex={-1}
          className={PAGE_CLASS}
        >
          {body}
        </main>
      </div>
    </UiLocaleProvider>
  );
}