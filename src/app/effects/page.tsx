import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadEffectsIndexRoute } from "@server/next/routeLoaders";
import { EffectsIndexPage } from "@/features/effects/pages/EffectsIndexPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const result = await loadEffectsIndexRoute();

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function EffectsPage() {
  const result = await loadEffectsIndexRoute();

  return <EffectsIndexPage {...result.pageProps} />;
}
