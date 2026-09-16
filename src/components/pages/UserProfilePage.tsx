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


/** Signed staff commentary ("Editor's note") rendered under the bio. */
export interface UserProfileEditorNote {
  /** The note's markdown, already rendered. */
  content: ReactNode;
  /** Signature line beside the avatar, e.g. "Josie Kins · founder". */
  attribution: string;
  /** The signer's (Josie's) avatar; null falls back to no image. */
  avatarUrl: string | null;
  /** The signer's public profile, when one exists. */
  avatarHref: string | null;
}
interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: PublicProfileHistoryEntry[];
  tripReports?: ReportCardModel[];
  /** Replications credited to this contributor, already ordered. */
  replications?: readonly GalleryReplication[];
  /** Effect articles crediting this contributor, already ordered. */
  effectArticles?: readonly ContributorEffectCredit[];
  /** Substance articles this contributor expert-reviewed, already ordered. */
  reviewedArticles?: readonly ContributorReviewedArticle[];
  reportHrefPrefix?: string;
  bioContent?: ReactNode;
  /** Staff "Editor's note" under the bio. Absent renders nothing. */
  editorNote?: UserProfileEditorNote | null;
  /** Reviewed identity-sheet outcome; absent/false renders no claim. */
  verifiedReplicator?: boolean;
  /** Server-rendered enrichment can stream after the profile identity header. */
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
  // Legacy Effect Index contributor title. It shares the muted handle line
  // rather than getting its own badge, so an absent role leaves the header
  // byte-for-byte as it was before roles existed.
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
                  {/* Real spaces rather than padding, so the copied and
                      screen-read text separates the two the same way. */}
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
              {/* A sentence, not a chip label. The pill's chip typography
                  (uppercase, wide tracking, tiny size) is declared after the
                  utility layer, so it is undone per-span — children only
                  inherit it, and their own declarations always win. */}
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

          {/* Signed staff commentary. The speech bubble reuses the profile
              quote chrome (the "a person said this" surface), with a tail
              notching the bottom border toward the signature chip — the same
              construction as the subjective-effect personal-commentary
              bubble, minus the collapse (a staff note is short by design). */}
          {editorNote ? (
            <section className="space-y-5" data-testid="editor-note">
              <PublicSectionHeading icon="lucide:message-circle" title={t("Editor's note")} />

              <div className="max-w-[72ch] px-1 sm:px-4">
                <div className="theme-profile-markdown-quote relative rounded-2xl px-5 py-4 italic sm:px-6">
                  {editorNote.content}
                  {/* Tail: a rotated square sharing the bubble fill and border.
                      Its opaque top half covers the bubble's bottom border so
                      bubble and tail read as one shape. */}
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

          {/* Reviewed articles follow the credits for the same reason the
              credits follow the works: they are curation of the archive rather
              than the contributor's own accounts, and the second tag run keeps
              the dense, scannable middle of the page together. */}
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
