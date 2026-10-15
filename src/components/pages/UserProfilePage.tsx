import { type ReactNode } from "react";
import { t } from "@/i18n/server";
import {
  ContributorAvatar,
  IconPillLink,
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { PublicAttributionSection } from "@/components/layout/PublicContentPrimitives";
import { PublicPill } from "@/components/common/PublicTokens";
import { StateCard } from "@/components/common/StateCard";
import { ContributorWorksCarousel } from "@/features/effects/gallery/ContributorWorksCarousel";
import { icons } from "@/utils/iconNames";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { PublicProfileHistoryEntry } from "@server/data/publicData.changelog";
import type { ContributorEffectCredit } from "@/types/effectCredits";
import type { GalleryReplication } from "@/types/replications";
import type { ReportCardModel } from "@/types/tripReport";
import type { ContributorReviewedArticle } from "@/types/reviewedArticles";
import { UserProfileEffectCreditsSection } from "./UserProfileEffectCreditsSection";
import { UserProfileReviewedArticlesSection } from "./UserProfileReviewedArticlesSection";
import {
  UserContributionsSection,
  UserTripReportsSection,
} from "./UserProfileExpandableSections";

export interface UserProfileEditorNote {
  content: ReactNode;
  attribution: string;
  avatarUrl: string | null;
  avatarHref: string | null;
}
interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: PublicProfileHistoryEntry[];
  tripReports?: ReportCardModel[];
  replications?: readonly GalleryReplication[];
  effectArticles?: readonly ContributorEffectCredit[];
  reviewedArticles?: readonly ContributorReviewedArticle[];
  reportHrefPrefix?: string;
  bioContent?: ReactNode;
  editorNote?: UserProfileEditorNote | null;
  verifiedReplicator?: boolean;
  children?: ReactNode;
  sectionsOnly?: boolean;
  hideBio?: boolean;
}

export function UserProfilePage({
  profile,
  history,
  tripReports = [],
  replications = [],
  effectArticles = [],
  reviewedArticles = [],
  reportHrefPrefix,
  bioContent,
  editorNote = null,
  verifiedReplicator = false,
  children,
  sectionsOnly = false,
  hideBio = false,
}: UserProfilePageProps) {
  const hasLinks = profile.links.length > 0;
  const hasBio = profile.hasCustomBio && !hideBio;
  const hasTripReports = tripReports.length > 0;
  const hasReplications = replications.length > 0;
  const hasEffectArticles = effectArticles.length > 0;
  const hasReviewedArticles = reviewedArticles.length > 0;
  const hasProfileSections =
    profile.hasCustomBio ||
    editorNote !== null ||
    hasReplications ||
    hasEffectArticles ||
    hasReviewedArticles ||
    hasTripReports ||
    history.length > 0;
  const profileHandle = `@${profile.key.toLowerCase()}`;
  const role = t(profile.role?.trim() ?? "");

  const content = (
    <>
      {!sectionsOnly ? (
      <header className="relative flex flex-col items-center gap-8 overflow-hidden py-6 text-center sm:py-10">
        <ContributorAvatar
          imageUrl={profile.avatarUrl}
          name={profile.displayName || profile.key}
          size="lg"
          lifted
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
                  <span aria-hidden="true" className="opacity-60">{" · "}</span>
                </>
              ) : null}
              {profileHandle}
            </p>
          </div>

          {profile.archival === true ? (
            <PublicPill
              tone="accent"
              icon="lucide:archive"
              data-testid="archival-notice"
              className="max-w-full flex-wrap justify-center gap-x-1.5 rounded-2xl px-4 py-2 text-left"
            >
              <span className="text-[0.8125rem] font-semibold normal-case tracking-normal">
                {t("Archival profile")}
              </span>
              <span className="theme-text-secondary text-[0.8125rem] font-normal normal-case tracking-normal">
                {t("maintained by staff, not created by this person.")}
              </span>
            </PublicPill>
          ) : null}

          {verifiedReplicator ? (
            <PublicPill
              tone="accent"
              icon="lucide:badge-check"
              data-testid="verified-replicator-badge"
            >
              {t("Verified replicator")}
            </PublicPill>
          ) : null}

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
      ) : null}

      {children ?? (hasProfileSections ? (
        <div className="mt-12 space-y-10 sm:mt-14 sm:space-y-12">
          {hasBio ? <UserProfileBio>{bioContent}</UserProfileBio> : null}

          {editorNote ? (
            <section className="space-y-5" data-testid="editor-note">
              <PublicSectionHeading icon="lucide:message-circle" title={t("Editor's note")} />

              <div className="max-w-[72ch] px-1 sm:px-4">
                <div className="theme-profile-markdown-quote relative rounded-2xl px-5 py-4 italic sm:px-6">
                  {editorNote.content}
                  <span
                    aria-hidden
                    className="theme-profile-markdown-quote-tail absolute -bottom-[7px] right-24 h-3.5 w-3.5 rotate-45 rounded-br-[2px] border-b border-r"
                  />
                </div>

                <PublicAttributionSection
                  className="mt-4 pr-4"
                  avatarSrc={editorNote.avatarUrl}
                  avatarAlt={editorNote.attribution}
                  avatarHref={editorNote.avatarHref ?? undefined}
                >
                  <span className="theme-accent-heading font-semibold">
                    {editorNote.attribution}
                  </span>
                </PublicAttributionSection>
              </div>
            </section>
          ) : null}

          {hasReplications ? (
            <ContributorWorksCarousel
              works={replications}
              contributorName={profile.displayName}
            />
          ) : null}

          {hasEffectArticles ? (
            <UserProfileEffectCreditsSection
              credits={effectArticles}
              contributorName={profile.displayName}
            />
          ) : null}

          {hasReviewedArticles ? (
            <UserProfileReviewedArticlesSection
              reviewedArticles={reviewedArticles}
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
            title={t("No public contributions yet")}
            description={t("{{name}} doesn't have a bio or published work on the wiki yet. Check back once they've added a profile or contributed an article or trip report.", { name: profile.displayName })}
          />
        </div>
      ))}
    </>
  );
  return sectionsOnly ? content : (
    <PublicContentShell focusTarget className="pb-24 pt-10 md:pt-14">{content}</PublicContentShell>
  );
}

export function UserProfileBio({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-5">
      <PublicSectionHeading icon="lucide:user" title={t("About")} />
      <div className="relative max-w-[72ch] px-1 sm:px-4 sm:py-1">{children}</div>
    </section>
  );
}
