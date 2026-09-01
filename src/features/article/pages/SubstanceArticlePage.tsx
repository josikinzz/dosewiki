/**
 * Public-facing substance article page using the unified ArticleLayout.
 *
 * The Next public route preloads the article on the server, so this component
 * stays purely presentational and avoids bundling client-side Convex fetch code.
 */

import { type ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import type { SubstanceContent } from "@/types/content";
import type { TripReport } from "@/types/tripReport";
import type { NormalizedReagentData } from "@/lib/reagentTesting";
import type { WarningBannerPreset } from "@/data/substanceWarningBanners";
import { ArticleLayout } from "../components/ArticleLayout";
import type { ContributorAvatarMap } from "../components/sections/ContributorsSection";
import type { ContributorDirectory } from "@server/contributorDirectory";

interface SubstanceArticlePageProps {
  article: SubstanceArticle;
  content?: SubstanceContent;
  fromSubstanceSlug?: string;
  linkableSubstanceSlugs?: readonly string[];
  linkableCategoryKeys?: readonly string[];
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
  hasRelatedTripReports?: boolean;
  replicationShowcaseSection?: ReactNode;
  contributorAvatars?: ContributorAvatarMap;
  contributorDirectory?: ContributorDirectory;
  externalReagentData?: NormalizedReagentData | null;
  /** Resolved for this slug by `resolveEnabledBanners`; absent means none. */
  warningBanners?: WarningBannerPreset[];
  /**
   * The site-wide banner glyph size from `getSafetyBannerIconSize`; absent
   * renders at the shipped default. One editor setting for the whole site, so it
   * travels beside `warningBanners` rather than on any preset.
   */
  warningBannerIconSize?: number;
  /**
   * Swap the stored citation-overhaul banner for the sitewide beta disclaimer;
   * set by the route loader once the citation audit has stripped a refuted
   * marker on this article. The loader has already filtered the overhaul
   * presets out of `warningBanners` when this is true.
   */
  showBetaDisclaimer?: boolean;
  /**
   * The `dosage-panel-disclaimer` and `tolerance-section-disclaimer` copy
   * blocks, read by the route loader; absent renders the checked-in defaults.
   */
  dosageDisclaimer?: string;
  toleranceDisclaimer?: string;
  /**
   * The `review-status-banner` and `expert-review-credit` copy blocks, read by
   * the route loader; absent renders the checked-in defaults.
   */
  reviewStatusCopy?: string;
  expertReviewCredit?: string;
}

export function SubstanceArticlePage({
  article,
  content,
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
  warningBanners,
  warningBannerIconSize,
  showBetaDisclaimer,
  dosageDisclaimer,
  toleranceDisclaimer,
  reviewStatusCopy,
  expertReviewCredit,
}: SubstanceArticlePageProps) {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <ArticleLayout
        article={article}
        content={content}
        fromSubstanceSlug={fromSubstanceSlug}
        linkableSubstanceSlugs={linkableSubstanceSlugs}
        linkableCategoryKeys={linkableCategoryKeys}
        relatedTripReports={relatedTripReports}
        tripReportsSection={tripReportsSection}
        hasRelatedTripReports={hasRelatedTripReports}
        replicationShowcaseSection={replicationShowcaseSection}
        contributorAvatars={contributorAvatars}
        contributorDirectory={contributorDirectory}
        externalReagentData={externalReagentData}
        warningBanners={warningBanners}
        warningBannerIconSize={warningBannerIconSize}
        showBetaDisclaimer={showBetaDisclaimer}
        dosageDisclaimer={dosageDisclaimer}
        toleranceDisclaimer={toleranceDisclaimer}
        reviewStatusCopy={reviewStatusCopy}
        expertReviewCredit={expertReviewCredit}
      />
    </main>
  );
}
