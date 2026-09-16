import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { loadContributorIdentityRoute, loadContributorRoute, type ContributorRouteResult } from "@server/next/routeLoaders.contributors";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { UserProfileBio, UserProfilePage } from "./UserProfilePage";
import { ProfileBioMarkdown } from "./ProfileBioMarkdown";

async function ContributorSections({ result }: { result: Promise<ContributorRouteResult> }) {
  const enriched = await result;
  if (enriched.kind === "not-found") notFound();
  if (enriched.kind === "redirect") permanentRedirect(enriched.target);
  return <UserProfilePage {...enriched.pageProps} sectionsOnly hideBio />;
}

export async function ContributorRoutePage({ profileKey, locale = null }: { profileKey: string; locale?: LiveLocale | null }) {
  const resolved = await loadContributorIdentityRoute(profileKey, locale);
  if (resolved.kind === "not-found") notFound();
  if (resolved.kind === "redirect") permanentRedirect(resolved.target);
  const enrichment = loadContributorRoute(profileKey, locale);
  const identity = resolved.deliveredIdentity;
  const profile = { ...resolved.profile, avatarUrl: identity?.avatar_url ?? resolved.profile.avatarUrl };
  return (
    <UserProfilePage profile={profile} history={[]} verifiedReplicator={identity?.verified_replicator === true}>
      {profile.hasCustomBio ? (
        <div className="mt-12 sm:mt-14">
          <UserProfileBio><ProfileBioMarkdown content={profile.bio} /></UserProfileBio>
        </div>
      ) : null}
      <Suspense fallback={<div className="mt-12 min-h-24" aria-busy="true" />}>
        <ContributorSections result={enrichment} />
      </Suspense>
    </UserProfilePage>
  );
}
