import { type ReactNode } from "react";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { SubstanceArticle } from "@/schema";
import type { MoleculeAsset, SubstanceContent } from "@/types/content";
import type { TripReport } from "@/types/tripReport";
import type { NormalizedReagentData } from "@/lib/reagentTesting";
import {
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  type WarningBannerPreset,
} from "@/data/substanceWarningBanners";
import { BetaDisclaimer } from "@/components/common/BetaDisclaimer";
import { IconSpriteScope } from "@/components/common/IconSprite";
import { HeroSection } from "./sections/HeroSection";
import { DosageDurationSection } from "./sections/DosageDurationSection";
import { SubjectiveEffectsSection } from "./sections/SubjectiveEffectsSection";
import { PharmacologySection } from "./sections/PharmacologySection";
import { InteractionsSection } from "./sections/InteractionsSection";
import { ToleranceSection } from "./sections/ToleranceSection";
import { HistoryCultureSection } from "./sections/HistoryCultureSection";
import { HarmPotentialSection } from "./sections/HarmPotentialSection";
import { ReagentSection } from "./sections/ReagentSection";
import { LegalitySection } from "./sections/LegalitySection";
import { CitationsSection } from "./sections/CitationsSection";
import { ContributorsSection, type ContributorAvatarMap } from "./sections/ContributorsSection";
import { resolveContributorHref, type ContributorDirectory } from "@server/contributorDirectory";
import { FeedbackSection } from "./sections/FeedbackSection";
import { TripReportsSection } from "./sections/TripReportsSection";
import { reportMatchesSubstance } from "@/features/reports/domain/tripReportIndex";
import { ReviewStatusBanner } from "./sections/ReviewStatusBanner";
import { SubstanceWarningBanners } from "./sections/SubstanceWarningBanners";
import { TableOfContentsSection } from "./sections/TableOfContentsSection";

export interface ArticleLayoutProps {
  article: SubstanceArticle;
  content?: SubstanceContent;
  /**
   * Convex-versioned depiction URL for hosts that resolve it themselves (the
   * review workbench); public routes bake it into `content.moleculeAssets`.
   */
  moleculeOverrideUrl?: string | null;
  fromSubstanceSlug?: string;
  /** Canonical public substance slugs used to suppress links to absent articles. */
  linkableSubstanceSlugs?: readonly string[];
  /** Canonical public category keys used to suppress links to absent category pages. */
  linkableCategoryKeys?: readonly string[];
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
  /**
   * Whether any related trip reports exist, resolved server-side when the
   * section itself streams in as `tripReportsSection`. Falls back to checking
   * `relatedTripReports` for hosts that pass reports directly.
   */
  hasRelatedTripReports?: boolean;
  /** Streamed Replication Showcase, rendered at the end of Subjective Effects. */
  replicationShowcaseSection?: ReactNode;
  contributorAvatars?: ContributorAvatarMap;
  contributorDirectory?: ContributorDirectory;
  externalReagentData?: NormalizedReagentData | null;
  /**
   * Banners already resolved for this slug by `resolveEnabledBanners`
   * (`src/data/substanceWarningBanners.ts`). Defaults to none so the review
   * workbench and Generator previews, which mount this layout without a route
   * loader, stay unbannered rather than guessing from classification.
   */
  warningBanners?: WarningBannerPreset[];
  /**
   * Rendered in the safety-banner slot, above the hero. A host that mounts the
   * layout without resolved banners (the review workbench) uses it to say so,
   * so their absence reads as a known omission rather than a data error.
   */
  warningBannerNotice?: ReactNode;
  /**
   * Swap the stored citation-overhaul banner for the sitewide red beta
   * disclaimer. Resolved by the substance route loader
   * (`substanceHasCitationNeeded`): true once the citation audit has stripped
   * a refuted marker on this article, in which case the loader has already
   * filtered the `citation-system-overhaul-*` presets out of `warningBanners`.
   * Defaults off so the review workbench and Generator previews are untouched.
   */
  showBetaDisclaimer?: boolean;
  /**
   * The site-wide safety-banner glyph size (`getSafetyBannerIconSize`, backed by
   * the `safety-banner-display` siteConfig document). One editor setting shared
   * by every banner, never a per-preset field. Defaults to the shipped constant
   * so the review workbench and Generator previews — which pass no banners at
   * all — are completely unaffected.
   */
  warningBannerIconSize?: number;
  /**
   * The `dosage-panel-disclaimer` and `tolerance-section-disclaimer` copy
   * blocks, resolved by the substance route loader. Absent renders each
   * checked-in default sentence, so the review workbench and Generator previews
   * still show the disclaimers they will ship with.
   */
  dosageDisclaimer?: string;
  toleranceDisclaimer?: string;
  /**
   * The `review-status-banner` and `expert-review-credit` copy blocks,
   * resolved by the substance route loader. Absent renders the checked-in
   * default sentences, so the review workbench and Generator previews still
   * show the credits they will ship with.
   */
  reviewStatusCopy?: string;
  expertReviewCredit?: string;
}

interface DeferredSectionProps {
  children: ReactNode;
}

function DeferredSection({ children }: DeferredSectionProps) {
  return <div className="theme-article-section-bleed">{children}</div>;
}

/**
 * Spacing rhythm for the article body. Rather than spacing every section
 * uniformly (which reads as monotonous despite the whitespace), the sections
 * are grouped into thematic "movements". Spacing *within* a movement stays at
 * the established cadence; the gap *between* movements is noticeably larger, so
 * scrolling has a clear sense of pacing and arrival at each new part.
 */
const articleMovementsClassName =
  "flex flex-col gap-28 sm:gap-32 lg:gap-36";
const articleMovementClassName =
  "flex flex-col gap-14 sm:gap-16 lg:gap-20";

/**
 * Unified article layout component that renders a substance article
 * using section components from /sections/.
 *
 * This component is used for both the public article pages and the
 * Generator preview tab, ensuring consistent visual design.
 */
export function ArticleLayout({
  article,
  content,
  moleculeOverrideUrl,
  fromSubstanceSlug,
  linkableSubstanceSlugs,
  linkableCategoryKeys,
  relatedTripReports,
  tripReportsSection,
  hasRelatedTripReports,
  replicationShowcaseSection,
  contributorAvatars,
  contributorDirectory,
  externalReagentData,
  warningBanners = [],
  warningBannerNotice,
  showBetaDisclaimer = false,
  warningBannerIconSize = SAFETY_BANNER_ICON_SIZE_DEFAULT,
  dosageDisclaimer,
  toleranceDisclaimer,
  reviewStatusCopy,
  expertReviewCredit,
}: ArticleLayoutProps) {
  // Credit hrefs resolve here rather than in the credit components: those are
  // client components, and handing them the directory would serialize every
  // contributor's aliases — which include real names — into the page HTML.
  const directory = contributorDirectory ?? [];
  const creditHrefs = {
    josie: resolveContributorHref("Josie Kins", directory),
    lyrea: resolveContributorHref("Lyrea", directory),
  };
  const subjectiveEffectsAttributionAuthor = article.subjective_effects?.attribution?.author;
  const subjectiveEffectsAttributionHref = subjectiveEffectsAttributionAuthor
    ? resolveContributorHref(subjectiveEffectsAttributionAuthor, directory)
    : null;

  // Drives the Trip Reports entry in the table of contents. When the section
  // streams in as a node, the host resolves this flag itself; otherwise it
  // mirrors TripReportsSection's own render condition (matched reports only).
  const tocHasTripReports =
    hasRelatedTripReports ??
    (relatedTripReports?.some((report) => reportMatchesSubstance(report, article)) ?? false);

  const chemistryPresentation = content?.chemistryPresentation ?? buildArticleChemistryPresentation(article);
  // Convex `moleculeOverrides` is the only depiction source: either this host
  // resolved the override URL itself, or the public route already baked it into
  // `content.moleculeAssets` (applyMoleculeOverrideUrl in publicRouteViewModels).
  // No override means no hero molecule image.
  const moleculeAssets: MoleculeAsset[] = moleculeOverrideUrl
    ? [{
        filename: `${article.id}.svg`,
        url: moleculeOverrideUrl,
        matchedField: "convex-molecule",
        matchedValue: String(article.id),
        resolution: "convex-canonical",
      }]
    : content?.moleculeAssets ?? [];

  return (
    <IconSpriteScope>
    <StickyTocLayout
      toc={(
        <TableOfContentsSection
          article={article}
          variant="bare"
          substanceSlug={fromSubstanceSlug}
          hasTripReports={tocHasTripReports}
          externalReagentData={externalReagentData}
        />
      )}
      contentClassName="gap-8"
      className="theme-toc-strip-scope"
    >
      {/* Mobile/tablet TOC: a sticky chip strip above the hero, pinned under
          the site header from the very first scroll. A direct child of the
          content column on purpose — sticky reach is bounded by the parent.
          Replaced by the sticky gutter TOC at >=1200px. */}
      <TableOfContentsSection
        article={article}
        variant="strip"
        substanceSlug={fromSubstanceSlug}
        hasTripReports={tocHasTripReports}
        externalReagentData={externalReagentData}
      />

      {/* The audited-article stand-in for the stored citation-overhaul banner:
          the same shimmering beta disclaimer the Substance Index header shows,
          bare rather than carded so it reads as site status, not as another
          safety warning. First in the banner slot above the hero. */}
      {showBetaDisclaimer && (
        <div className="text-center text-sm italic text-balance">
          <BetaDisclaimer />
        </div>
      )}

      {/* Compact status chip on articles awaiting editorial review; renders
          nothing once the review ticks complete (path revalidation removes it
          without a redeploy). Sits below the beta disclaimer and above the
          safety banners. */}
      <ReviewStatusBanner
        article={article}
        avatarSrc={contributorAvatars?.lyrea}
        profileHref={creditHrefs.lyrea}
        copy={reviewStatusCopy}
      />

      {/* Opt-in drug-class safety banners: above the hero because a reader who
          bounces at the fold must still have seen the warning, and outside
          HeroSection so the hero keeps rendering byte-identically on the
          overwhelming majority of articles that have none. Renders nothing when
          the list is empty; spacing comes from StickyTocLayout's `gap-8`. */}
      {warningBannerNotice}
      <SubstanceWarningBanners banners={warningBanners} iconSize={warningBannerIconSize} />

      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        moleculeAsset={moleculeAssets[0]}
        moleculeAssets={moleculeAssets}
        linkableCategoryKeys={linkableCategoryKeys}
        showPreviewBadge={false}
      />

      <div className={articleMovementsClassName}>
          {/* Movement 1 — Practical use: what to take, what it feels like, how to verify it */}
          <div className={articleMovementClassName}>
            <DosageDurationSection article={article} dosageDisclaimer={dosageDisclaimer} />
            <SubjectiveEffectsSection
              article={article}
              attributionHref={subjectiveEffectsAttributionHref}
              replicationShowcaseSection={replicationShowcaseSection}
            />
            <DeferredSection>
              <ReagentSection
                article={article}
                chemistryPresentation={chemistryPresentation}
                substanceSlug={fromSubstanceSlug}
                externalReagentData={externalReagentData}
              />
            </DeferredSection>
          </div>

          {/* Movement 2 — Pharmacology: how it works in the body */}
          <div className={articleMovementClassName}>
            <DeferredSection>
              <PharmacologySection article={article} />
            </DeferredSection>
            <DeferredSection>
              <InteractionsSection
                article={article}
                linkableSubstanceSlugs={linkableSubstanceSlugs}
              />
            </DeferredSection>
            <DeferredSection>
              <ToleranceSection article={article} disclaimer={toleranceDisclaimer} />
            </DeferredSection>
          </div>

          {/* Movement 3 — Context: risk, story, lived experience, and law */}
          <div className={articleMovementClassName}>
            <DeferredSection>
              <HarmPotentialSection article={article} />
            </DeferredSection>
            <DeferredSection>
              <HistoryCultureSection article={article} />
            </DeferredSection>
            <DeferredSection>
              {tripReportsSection ?? (
                <TripReportsSection
                  reports={relatedTripReports}
                  fromSubstanceSlug={fromSubstanceSlug}
                />
              )}
            </DeferredSection>
            <DeferredSection>
              <LegalitySection article={article} />
            </DeferredSection>
          </div>

          {/* Movement 4 — References */}
          <div className={articleMovementClassName}>
            <DeferredSection>
              <CitationsSection article={article} />
            </DeferredSection>
          </div>

          {/* Movement 5 — Contributors: closing credits for who reviewed and built the article */}
          <div className={articleMovementClassName}>
            <DeferredSection>
              <ContributorsSection
                article={article}
                avatars={contributorAvatars}
                profileHrefs={creditHrefs}
                expertReviewCredit={expertReviewCredit}
                reviewStatusCopy={reviewStatusCopy}
              />
            </DeferredSection>
            <DeferredSection>
              <FeedbackSection article={article} />
            </DeferredSection>
          </div>
        </div>
    </StickyTocLayout>
    </IconSpriteScope>
  );
}
