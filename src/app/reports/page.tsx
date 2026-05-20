import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getReportsIndexRouteOutcome } from "@server/next/publicRouteOutcomes";
import { TripReportsPage } from "@/features/reports/pages/TripReportsPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const { viewModel } = await getReportsIndexRouteOutcome();

  return buildPublicPageMetadata({
    title: viewModel.metadata.title,
    description: viewModel.metadata.description,
    route: { family: "reports" },
  });
}

export default async function ReportsPage() {
  const outcome = await getReportsIndexRouteOutcome();

  return (
    <TripReportsPage
      {...outcome.viewModel.pageProps}
      emptyState={outcome.state === "empty" ? outcome.emptyState : undefined}
    />
  );
}
