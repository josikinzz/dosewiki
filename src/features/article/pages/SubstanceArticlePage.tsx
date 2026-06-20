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
import { ArticleLayout } from "../components/ArticleLayout";
import type { ContributorAvatarMap } from "../components/sections/ContributorsSection";

interface SubstanceArticlePageProps {
  article: SubstanceArticle;
  content?: SubstanceContent;
  fromSubstanceSlug?: string;
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
  contributorAvatars?: ContributorAvatarMap;
}

export function SubstanceArticlePage({
  article,
  content,
  fromSubstanceSlug,
  relatedTripReports,
  tripReportsSection,
  contributorAvatars,
}: SubstanceArticlePageProps) {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <ArticleLayout
        article={article}
        content={content}
        fromSubstanceSlug={fromSubstanceSlug}
        relatedTripReports={relatedTripReports}
        tripReportsSection={tripReportsSection}
        contributorAvatars={contributorAvatars}
      />
    </main>
  );
}

export default SubstanceArticlePage;
