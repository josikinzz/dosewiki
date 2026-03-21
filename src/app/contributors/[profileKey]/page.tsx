import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getReportsByAuthor } from "@server/convex/publicData";
import { getStaticContributorParams } from "@server/next/staticParams";
import { buildProfileHistory, getProfileByKey, profilesByKey } from "@/data/userProfiles";
import { ProfileBioMarkdown } from "@/components/pages/ProfileBioMarkdown";
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
  const reports = await getReportsByAuthor(profile.displayName);
  const history = buildProfileHistory(normalizedKey, 5);

  return (
    <UserProfilePage
      profile={profile}
      history={history}
      bioContent={profile.hasCustomBio ? <ProfileBioMarkdown content={profile.bio} /> : null}
      reportHrefPrefix="/reports/"
      tripReports={reports.map((report) => ({
        slug: report.slug,
        title: report.title,
        featured: report.featured,
        subject: { name: report.author, trip_date: report.tripDate },
        substances: report.substanceNames.map((name) => ({ name })),
        introduction: report.introduction,
        onset: [],
        peak: [],
        offset: [],
        conclusion: undefined,
        tags: [],
      }))}
    />
  );
}
