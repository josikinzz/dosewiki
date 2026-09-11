"use client";

import { memo } from "react";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { useReagentData } from "@/hooks/useReagentData";
import { useT } from "@/i18n/client";
import {
  hasDisplayableReagentData,
  type NormalizedReagentData,
} from "@/lib/reagentTesting";
import { slugify } from "@/utils/slug";
import type { SubstanceArticle } from "@/schema";
import {
  ALWAYS_RENDERED_PUBLIC_SECTION_IDS,
  getPublicTocSectionEntries,
} from "@/schema/substance/sectionManifest";

interface TableOfContentsSectionProps {
  article: SubstanceArticle;
  /** "strip" renders the sticky mobile chip strip instead of the panel/rail. */
  variant?: "panel" | "bare" | "strip";
  className?: string;
  substanceSlug?: string;
  externalReagentData?: NormalizedReagentData | null;
  /**
   * Whether any related trip reports exist for this substance. Reports live in
   * Convex rather than on the article, so the host resolves this upstream.
   */
  hasTripReports?: boolean;
}

function hasStaticReagentData(article: SubstanceArticle): boolean {
  return Boolean(
    article.reagent_testing &&
    Object.values(article.reagent_testing).some((value) => value?.trim().length > 0),
  );
}

export const TableOfContentsSection = memo(function TableOfContentsSection({
  article,
  variant,
  className,
  substanceSlug,
  externalReagentData,
  hasTripReports,
}: TableOfContentsSectionProps) {
  const t = useT();
  const hasStaticReagentEntries = hasStaticReagentData(article);
  const hasServerResolvedData = externalReagentData !== undefined;
  const lookupSlug = substanceSlug ?? slugify(article.title);
  const { data: clientReagentData, isLoading: isLoadingClientData } = useReagentData(
    hasStaticReagentEntries || hasServerResolvedData ? "" : lookupSlug,
  );
  const reagentData = hasServerResolvedData ? externalReagentData : clientReagentData;
  const isLoadingReagentData = hasServerResolvedData ? false : isLoadingClientData;
  const hasCachedReagentData = hasDisplayableReagentData(reagentData);

  const articleItems: PublicTableOfContentsItem[] = getPublicTocSectionEntries().filter((item) =>
    // Editorial sections render a gap notice when empty rather than disappearing,
    // so they always have an anchor to link to.
    ALWAYS_RENDERED_PUBLIC_SECTION_IDS.includes(item.id) ||
    (item.public.isPresent?.(article, {
      hasExternalReagentData: hasCachedReagentData,
      isLoadingExternalReagentData: isLoadingReagentData,
      hasTripReports,
    }) ?? false),
  ).map(
    (item) => ({
      id: item.id,
      label: t(item.label),
      icon: item.icon,
    }),
  );
  const presentItems: PublicTableOfContentsItem[] = [
    { id: "introduction", label: t("Introduction"), icon: "lucide:file-text" },
    ...articleItems,
    { id: "article-status", label: t("Article Status"), icon: "lucide:shield-check" },
    { id: "feedback", label: t("Feedback"), icon: "lucide:message-square-plus" },
  ];

  if (presentItems.length === 0) {
    return null;
  }

  if (variant === "strip") {
    return <PublicTocStrip items={presentItems} className={className} />;
  }

  return <PublicTableOfContents items={presentItems} variant={variant} className={className} />;
});
