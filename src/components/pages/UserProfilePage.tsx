import { type ReactNode } from "react";
import {
  ContributorAvatar,
  IconPillLink,
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { StateCard } from "@/components/common/StateCard";
import { ContributorWorksCarousel } from "@/features/effects/gallery/ContributorWorksCarousel";
import { icons } from "@/utils/iconNames";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ContributorEffectCredit } from "@/types/effectCredits";
import type { GalleryReplication } from "@/types/replications";
import type { ReportCardModel } from "@/types/tripReport";
import { UserProfileEffectCreditsSection } from "./UserProfileEffectCreditsSection";
import {
  UserContributionsSection,
  UserTripReportsSection,
} from "./UserProfileExpandableSections";

interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
  tripReports?: ReportCardModel[];
  /** Replications credited to this contributor, already ordered. */
  replications?: readonly GalleryReplication[];
  /** Effect articles crediting this contributor, already ordered. */
  effectArticles?: readonly ContributorEffectCredit[];
  reportHrefPrefix?: string;
  bioContent?: ReactNode;
}

export function UserProfilePage({
  profile,
  history,
  tripReports = [],
  replications = [],
  effectArticles = [],
  reportHrefPrefix,
  bioContent,
}: UserProfilePageProps) {
  const hasLinks = profile.links.length > 0;
  const hasBio = profile.hasCustomBio;
  const hasTripReports = tripReports.length > 0;
  const hasReplications = replications.length > 0;
  const hasEffectArticles = effectArticles.length > 0;
  const hasProfileSections =
    hasBio || hasReplications || hasEffectArticles || hasTripReports || history.length > 0;
  const profileHandle = `@${profile.key.toLowerCase()}`;
  // Legacy Effect Index contributor title. It shares the muted handle line
  // rather than getting its own badge, so an absent role leaves the header
  // byte-for-byte as it was before roles existed.
  const role = profile.role?.trim() ?? "";

  return (
    <PublicContentShell focusTarget className="pb-24 pt-10 md:pt-14">
      <header className="relative flex flex-col items-center gap-8 overflow-hidden py-6 text-center sm:py-10">
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
            <p className="theme-text-muted mt-2 text-lg font-medium">
              {role ? (
                <>
                  <span data-testid="contributor-role">{role}</span>
                  {/* Real spaces rather than padding, so the copied and
                      screen-read text separates the two the same way. */}
                  <span aria-hidden="true" className="opacity-60">{" · "}</span>
                </>
              ) : null}
              {profileHandle}
            </p>
          </div>

          {hasLinks && (
            <nav
              aria-label={`${profile.displayName} profile links`}
              className="flex flex-wrap justify-center gap-3"
            >
              {profile.links.map((link) => (
                <IconPillLink
                  key={link.url}
                  href={link.url}
                  label={link.label}
                  icon="lucide:link-2"
                  external
                  className="min-h-11 px-4"
                />
              ))}
            </nav>
          )}
        </div>
      </header>

      {hasProfileSections ? (
        <div className="mt-12 space-y-10 sm:mt-14 sm:space-y-12">
          {hasBio ? (
            <section className="space-y-5">
              <PublicSectionHeading icon="lucide:user" title="About" />

              <div className="relative max-w-[72ch] px-1 sm:px-4 sm:py-1">
                {bioContent}
              </div>
            </section>
          ) : null}

          {/* An artist's works come before their writing: for a replication
              artist the pictures are the profile, and the carousel is the only
              place they are gathered as one body of work. */}
          {hasReplications ? (
            <ContributorWorksCarousel
              works={replications}
              contributorName={profile.displayName}
            />
          ) : null}

          {/* Article credits sit between the pictures and the writing. They are
              this person's contribution *to the archive* — for the five large
              contributors it is the bulk of what they did here — whereas trip
              reports are their own accounts and the changelog below is the raw
              edit record. Placing the tag list here also breaks up two runs of
              tall cards with a dense, quickly-scanned block. */}
          {hasEffectArticles ? (
            <UserProfileEffectCreditsSection
              credits={effectArticles}
              contributorName={profile.displayName}
            />
          ) : null}

          {hasTripReports ? (
            <UserTripReportsSection
              profileKey={profile.key}
              tripReports={tripReports}
              reportOrder={profile.reportOrder}
              reportHrefPrefix={reportHrefPrefix}
            />
          ) : null}

          <UserContributionsSection profileKey={profile.key} history={history} />
        </div>
      ) : (
        <div className="mt-12 sm:mt-14">
          <StateCard
            tone="neutral"
            icon={icons.fileSignature}
            title="No public contributions yet"
            description={`${profile.displayName} doesn't have a bio or published work on the wiki yet. Check back once they've added a profile or contributed an article or trip report.`}
          />
        </div>
      )}
    </PublicContentShell>
  );
}
