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
   * The `dosage-panel-disclaimer` copy block, read by the route loader; absent
   * renders the checked-in default sentence.
   */
  dosageDisclaimer?: string;
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
  dosageDisclaimer,
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
        dosageDisclaimer={dosageDisclaimer}
      />
    </main>
  );
}
