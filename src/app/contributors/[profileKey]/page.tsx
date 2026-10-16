import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadContributorIdentityRoute } from "@server/next/routeLoaders.contributors";
import { ContributorRoutePage } from "@/components/pages/ContributorRoutePage";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

type ContributorPageProps = {
  params: Promise<{
    profileKey: string;
  }>;
};

export async function generateMetadata({ params }: ContributorPageProps) {
  const { profileKey } = await params;
  const result = await loadContributorIdentityRoute(profileKey);

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
    socialImage: entitySocialCardImage(
      "contributors",
      result.socialCardProfileKey,
      `${result.metadata.title} contributor profile card`,
    ),
  });
}

export default async function ContributorPage({ params }: ContributorPageProps) {
  const { profileKey } = await params;
  return <ContributorRoutePage profileKey={profileKey} />;
}
