"use client";

import { memo } from "react";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { useReagentData } from "@/hooks/useReagentData";
import { hasDisplayableReagentData } from "@/lib/reagentTesting";
import type { SubstanceArticle } from "@/schema";
import { getPublicTocSectionEntries } from "@/schema/substance/sectionManifest";

interface TableOfContentsSectionProps {
  article: SubstanceArticle;
}

function hasStaticReagentData(article: SubstanceArticle): boolean {
  return Boolean(
    article.reagent_testing &&
    Object.values(article.reagent_testing).some((value) => value?.trim().length > 0),
  );
}

export const TableOfContentsSection = memo(function TableOfContentsSection({
  article,
}: TableOfContentsSectionProps) {
  const hasStaticReagentEntries = hasStaticReagentData(article);
  const substanceName = article.identification?.common_name || article.title || "";
  const aliases = article.identification?.alternative_names || [];
  const { data: reagentApiData, isLoading: isLoadingReagentData } = useReagentData(
    hasStaticReagentEntries ? "" : substanceName,
    hasStaticReagentEntries ? [] : aliases,
  );
  const hasApiReagentData = hasDisplayableReagentData(reagentApiData);

  const presentItems: PublicTableOfContentsItem[] = getPublicTocSectionEntries().filter((item) =>
    item.public.isPresent?.(article, {
      hasExternalReagentData: hasApiReagentData,
      isLoadingExternalReagentData: isLoadingReagentData,
    }) ?? false,
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

  return <PublicTableOfContents items={presentItems} />;
});
