"use client";

import { memo } from "react";
import { useReagentData } from "@/hooks/useReagentData";
import { useT } from "@/i18n/client";
import {
  hasDisplayableReagentData,
  type NormalizedReagentData,
} from "@/lib/reagentTesting";
import type { SubstanceArticle } from "@/schema";
import { slugify } from "@/utils/slug";
import { TableOfContentsSection } from "./TableOfContentsSection";
import { buildArticleTableOfContentsItems } from "./tableOfContentsModel";

interface ArticleTableOfContentsProps {
  article: SubstanceArticle;
  variant?: "panel" | "bare" | "strip";
  className?: string;
  substanceSlug?: string;
  externalReagentData?: NormalizedReagentData | null;
  hasTripReports?: boolean;
}

/** Reactive adapter retained for editor previews that mutate the whole article. */
export const ArticleTableOfContents = memo(function ArticleTableOfContents({
  article,
  variant,
  className,
  substanceSlug,
  externalReagentData,
  hasTripReports,
}: ArticleTableOfContentsProps) {
  const t = useT();
  const hasStaticReagentEntries = Boolean(
    article.reagent_testing &&
    Object.values(article.reagent_testing).some(
      (value) => value?.trim().length > 0,
    ),
  );
  const hasServerResolvedData = externalReagentData !== undefined;
  const lookupSlug = substanceSlug ?? slugify(article.title);
  const { data: clientReagentData, isLoading: isLoadingClientData } =
    useReagentData(
      hasStaticReagentEntries || hasServerResolvedData ? "" : lookupSlug,
    );
  const reagentData = hasServerResolvedData
    ? externalReagentData
    : clientReagentData;
  const items = buildArticleTableOfContentsItems(article, t, {
    hasExternalReagentData: hasDisplayableReagentData(reagentData),
    isLoadingExternalReagentData: hasServerResolvedData
      ? false
      : isLoadingClientData,
    hasTripReports,
  });

  return (
    <TableOfContentsSection
      items={items}
      variant={variant}
      className={className}
    />
  );
});
