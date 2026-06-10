import { notFound, permanentRedirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadContributorRoute } from "@server/next/routeLoaders";
import { getStaticContributorParams } from "@server/next/staticParams";
import { UserProfilePage } from "@/components/pages/UserProfilePage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticContributorParams();
}

type ContributorPageProps = {
  params: Promise<{
    profileKey: string;
  }>;
};

export async function generateMetadata({ params }: ContributorPageProps) {
  const { profileKey } = await params;
  const result = await loadContributorRoute(profileKey);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      title: "Contributor",
      description: `Browse contributor profile ${result.normalizedKey}.`,
      route: { family: "contributor", params: { profileKey: result.normalizedKey } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ContributorPage({ params }: ContributorPageProps) {
  const { profileKey } = await params;
  const result = await loadContributorRoute(profileKey);

  if (result.kind === "not-found") {
    notFound();
  }
  if (result.kind === "redirect") {
    permanentRedirect(result.target);
  }

  return <UserProfilePage {...result.pageProps} />;
}
