"use client";

import { memo } from "react";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { useReagentData } from "@/hooks/useReagentData";
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
}: TableOfContentsSectionProps) {
  const hasStaticReagentEntries = hasStaticReagentData(article);
  const hasServerResolvedData = externalReagentData !== undefined;
  const lookupSlug = substanceSlug ?? slugify(article.title);
  const { data: clientReagentData, isLoading: isLoadingClientData } = useReagentData(
    hasStaticReagentEntries || hasServerResolvedData ? "" : lookupSlug,
  );
  const reagentData = hasServerResolvedData ? externalReagentData : clientReagentData;
  const isLoadingReagentData = hasServerResolvedData ? false : isLoadingClientData;
  const hasCachedReagentData = hasDisplayableReagentData(reagentData);

  const presentItems: PublicTableOfContentsItem[] = getPublicTocSectionEntries().filter((item) =>
    // Editorial sections render a gap notice when empty rather than disappearing,
    // so they always have an anchor to link to.
    ALWAYS_RENDERED_PUBLIC_SECTION_IDS.includes(item.id) ||
    (item.public.isPresent?.(article, {
      hasExternalReagentData: hasCachedReagentData,
      isLoadingExternalReagentData: isLoadingReagentData,
    }) ?? false),
  ).map(
    (item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
    }),
  );

  if (presentItems.length === 0) {
    return null;
  }

  if (variant === "strip") {
    return <PublicTocStrip items={presentItems} className={className} />;
  }

  return <PublicTableOfContents items={presentItems} variant={variant} className={className} />;
});
