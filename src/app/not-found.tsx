import type { Metadata } from "next";
import { getCopyByKeys } from "@server/next/copyBlocks";
import { buildPageMetadata } from "@server/next/metadata";
import { getStatusRecoveryLink } from "@server/next/statusRecoveryLinks";
import { NotFoundBody } from "./_components/NotFoundBody";

// `not-found.tsx` takes a static `metadata` export — Next does not run
// `generateMetadata` for it — so the 404's SEO description stays in code while
// its on-page prose is editable below.
export const metadata: Metadata = buildPageMetadata({
  title: "Page not found",
  description: "The page you requested does not exist or may have moved.",
  pathname: "/404",
  noIndex: true,
});

export default async function NotFound() {
  const copy = await getCopyByKeys(["not-found-title", "not-found-body"]);
  const substancesLink = getStatusRecoveryLink("substances");
  const effectsLink = getStatusRecoveryLink("effects");
  const reportsLink = getStatusRecoveryLink("reports");

  return (
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
  );
}
