import { type ReactNode } from "react";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { SubstanceArticle } from "@/schema";
import type { MoleculeAsset, SubstanceContent } from "@/types/content";
import type { TripReport } from "@/types/tripReport";
import type { NormalizedReagentData } from "@/lib/reagentTesting";
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
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
  /**
   * Whether any related trip reports exist, resolved server-side when the
   * section itself streams in as `tripReportsSection`. Falls back to checking
   * `relatedTripReports` for hosts that pass reports directly.
   */
  hasRelatedTripReports?: boolean;
  /** Streamed Replication Showcase, rendered inside the Subjective Effects visual group. */
  replicationShowcaseSection?: ReactNode;
  contributorAvatars?: ContributorAvatarMap;
  contributorDirectory?: ContributorDirectory;
  externalReagentData?: NormalizedReagentData | null;
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
  relatedTripReports,
  tripReportsSection,
  hasRelatedTripReports,
  replicationShowcaseSection,
  contributorAvatars,
  contributorDirectory,
  externalReagentData,
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

      {/* Compact status chip on articles awaiting editorial review; renders
          nothing once the review ticks complete (path revalidation removes it
          without a redeploy). */}
      <ReviewStatusBanner
        article={article}
        avatarSrc={contributorAvatars?.lyrea}
        profileHref={creditHrefs.lyrea}
      />

      <HeroSection
        article={article}
        chemistryPresentation={chemistryPresentation}
        moleculeAsset={moleculeAssets[0]}
        moleculeAssets={moleculeAssets}
        showPreviewBadge={false}
      />

      <div className={articleMovementsClassName}>
          {/* Movement 1 — Practical use: what to take, what it feels like, how to verify it */}
          <div className={articleMovementClassName}>
            <DosageDurationSection article={article} />
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
              <InteractionsSection article={article} />
            </DeferredSection>
            <DeferredSection>
              <ToleranceSection article={article} />
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
              />
            </DeferredSection>
            <DeferredSection>
              <FeedbackSection article={article} />
            </DeferredSection>
          </div>
        </div>
    </StickyTocLayout>
  );
}

export default ArticleLayout;
