import { type ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import type { SubstanceContent } from "@/types/content";
import type { TripReport } from "@/types/tripReport";
import type { NormalizedReagentData } from "@/lib/reagentTesting";
import type { WarningBannerPreset } from "@/data/substanceWarningBanners";
import { ArticleLayout, type ArticleLayoutProps, type ArticleSecondarySections } from "../components/ArticleLayout";
import type { ContributorAvatarMap } from "../components/sections/ContributorsSection";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { EditorLauncherTarget } from "@/features/editor-launcher/EditorLauncherTarget";
import ArticleContextBridge from "../editing/ArticleContextBridge.editor";

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
  secondarySections?: ArticleSecondarySections;
  contributorAvatars?: ContributorAvatarMap;
  contributorDirectory?: ContributorDirectory;
  externalReagentData?: NormalizedReagentData | null;
  warningBanners?: WarningBannerPreset[];
  warningBannerIconSize?: number;
  showBetaDisclaimer?: boolean;
  dosageDisclaimer?: string;
  toleranceDisclaimer?: string;
  reviewStatusCopy?: string;
  expertReviewCredit?: string;
  recentChanges?: ArticleRecentChange[];
  warningBannerNotice?: ReactNode;
  translatorNotes?: ArticleLayoutProps["translatorNotes"];
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
  secondarySections,
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
  recentChanges,
  warningBannerNotice,
  translatorNotes,
}: SubstanceArticlePageProps) {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      {fromSubstanceSlug ? (
        <EditorLauncherTarget target={{
          kind: "substance",
          slug: fromSubstanceSlug,
          name: article.identification.common_name || article.title,
        }} />
      ) : null}
      <ArticleContextBridge
        key={fromSubstanceSlug}
        slug={fromSubstanceSlug}
        article={article}
        layoutProps={{
          content, linkableSubstanceSlugs, linkableCategoryKeys, relatedTripReports,
          tripReportsSection, hasRelatedTripReports, replicationShowcaseSection,
          contributorAvatars, externalReagentData, warningBanners, warningBannerIconSize,
          showBetaDisclaimer, dosageDisclaimer, toleranceDisclaimer, reviewStatusCopy,
          expertReviewCredit, recentChanges, translatorNotes,
        }}
      >
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
        secondarySections={secondarySections}
        contributorAvatars={contributorAvatars}
        contributorDirectory={contributorDirectory}
        externalReagentData={externalReagentData}
        warningBannerNotice={warningBannerNotice}
        warningBanners={warningBanners}
        warningBannerIconSize={warningBannerIconSize}
        showBetaDisclaimer={showBetaDisclaimer}
        dosageDisclaimer={dosageDisclaimer}
        toleranceDisclaimer={toleranceDisclaimer}
        reviewStatusCopy={reviewStatusCopy}
        expertReviewCredit={expertReviewCredit}
        recentChanges={recentChanges}
        translatorNotes={translatorNotes}
      />
      </ArticleContextBridge>
    </main>
  );
}
