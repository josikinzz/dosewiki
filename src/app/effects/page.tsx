import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getEffectsIndexRouteOutcome } from "@server/next/publicRouteOutcomes";
import { EffectsIndexPage } from "@/features/effects/pages/EffectsIndexPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const { viewModel } = await getEffectsIndexRouteOutcome();

  return buildPublicPageMetadata({
    title: viewModel.metadata.title,
    description: viewModel.metadata.description,
    route: { family: "effects" },
  });
}

export default async function EffectsPage() {
  const outcome = await getEffectsIndexRouteOutcome();

  return (
    <EffectsIndexPage
      {...outcome.viewModel.pageProps}
      emptyState={outcome.state === "empty" ? outcome.emptyState : undefined}
    />
  );
}
