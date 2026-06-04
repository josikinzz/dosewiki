import { type ReactNode } from "react";
import {
  ContributorAvatar,
  IconPillLink,
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ReportCardModel } from "@/types/tripReport";
import {
  UserContributionsSection,
  UserTripReportsSection,
} from "./UserProfileExpandableSections";

interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
  tripReports?: ReportCardModel[];
  reportHrefPrefix?: string;
  bioContent?: ReactNode;
}

export function UserProfilePage({
  profile,
  history,
  tripReports = [],
  reportHrefPrefix,
  bioContent,
}: UserProfilePageProps) {
  const hasLinks = profile.links.length > 0;
  const hasBio = profile.hasCustomBio;

  return (
    <PublicContentShell focusTarget className="pb-24">
      <div className="flex flex-col items-center gap-8 text-center">
        <ContributorAvatar
          imageUrl={profile.avatarUrl}
          name={profile.displayName || profile.key}
          size="lg"
          glow
          className="group"
        />

        <div className="flex flex-col items-center gap-6">
          <div>
            <h1 className="theme-accent-heading font-display break-words text-4xl font-bold tracking-tight sm:text-5xl">
              {profile.displayName}
            </h1>
            <p className="theme-accent-heading mt-2 text-lg font-medium opacity-80">
              @{profile.key.toLowerCase()}
            </p>
          </div>

          {hasLinks && (
            <div className="flex flex-wrap justify-center gap-3">
              {profile.links.map((link) => (
                <IconPillLink
                  key={link.url}
                  href={link.url}
                  label={link.label}
                  icon="lucide:link-2"
                  external
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-16 space-y-12">
        {hasBio && (
          <section className="space-y-6">
            <PublicSectionHeading icon="lucide:user" title="About" />

            <div className="relative px-4 py-2">{bioContent}</div>
          </section>
        )}

        <UserTripReportsSection
          displayName={profile.displayName}
          profileKey={profile.key}
          tripReports={tripReports}
          reportHrefPrefix={reportHrefPrefix}
        />

        <UserContributionsSection profileKey={profile.key} history={history} />
      </div>
    </PublicContentShell>
  );
}
