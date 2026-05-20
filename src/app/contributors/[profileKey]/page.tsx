import { notFound, permanentRedirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  getPublicContributorByKey,
  getReportsByContributor,
} from "@server/convex/publicData";
import { getStaticContributorParams } from "@server/next/staticParams";
import { buildProfileHistory } from "@/data/userProfiles";
import { ProfileBioMarkdown } from "@/components/pages/ProfileBioMarkdown";
import { UserProfilePage } from "@/components/pages/UserProfilePage";
import { toReportCardModel } from "@/types/tripReport";

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
  const normalizedKey = decodeURIComponent(profileKey).trim().toUpperCase();
  const profile = await getPublicContributorByKey(normalizedKey);

  return buildPublicPageMetadata({
    title: profile?.displayName ?? "Contributor",
    description: profile?.bio || `Browse contributor profile ${normalizedKey}.`,
    route: { family: "contributor", params: { profileKey: normalizedKey } },
  });
}

export default async function ContributorPage({ params }: ContributorPageProps) {
  const { profileKey } = await params;
  const requestedKey = decodeURIComponent(profileKey).trim();
  const normalizedKey = requestedKey.toUpperCase();
  const profile = await getPublicContributorByKey(normalizedKey);
  if (!profile) {
    notFound();
  }
  if (profile.key !== normalizedKey) {
    permanentRedirect(`/contributors/${encodeURIComponent(profile.key.toLowerCase())}`);
  }
  const reports = await getReportsByContributor(profile);
  const history = buildProfileHistory(profile.key, 5, profile.aliases);

  return (
    <UserProfilePage
      profile={profile}
      history={history}
      bioContent={profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null}
      reportHrefPrefix="/reports/"
      tripReports={reports.map(toReportCardModel)}
    />
  );
}
