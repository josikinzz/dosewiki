import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getReportsByAuthor } from "@server/convex/publicData";
import { getProfileByKey, profilesByKey } from "@/data/userProfiles";
import { LegacyPublicRouteClient } from "../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type ContributorPageProps = {
  params: Promise<{
    profileKey: string;
  }>;
};

export async function generateMetadata({ params }: ContributorPageProps) {
  const { profileKey } = await params;
  const normalizedKey = decodeURIComponent(profileKey).trim().toUpperCase();
  const profile = profilesByKey.get(normalizedKey);

  return buildPageMetadata({
    title: profile?.displayName ?? "Contributor",
    description: profile?.bio || `Browse contributor profile ${normalizedKey}.`,
    pathname: `/contributors/${encodeURIComponent(normalizedKey)}`,
  });
}

export default async function ContributorPage({ params }: ContributorPageProps) {
  const { profileKey } = await params;
  const normalizedKey = decodeURIComponent(profileKey).trim().toUpperCase();

  if (!profilesByKey.has(normalizedKey)) {
    notFound();
  }

  const profile = getProfileByKey(normalizedKey);
  await getReportsByAuthor(profile.displayName);

  return <LegacyPublicRouteClient view={{ type: "contributor", profileKey: normalizedKey }} />;
}
