import type { PublicTableOfContentsItem } from "@/components/common/PublicTableOfContents";
import type { SubstanceArticle } from "@/schema";
import {
  ALWAYS_RENDERED_PUBLIC_SECTION_IDS,
  getPublicTocSectionEntries,
} from "@/schema/substance/sectionManifest";

export interface ArticleTocPresence {
  hasExternalReagentData?: boolean;
  isLoadingExternalReagentData?: boolean;
  hasTripReports?: boolean;
}

export type ArticleTocTranslate = (text: string) => string;

export function buildArticleTableOfContentsItems(
  article: SubstanceArticle,
  t: ArticleTocTranslate,
  presence: ArticleTocPresence = {},
): PublicTableOfContentsItem[] {
  const articleItems = getPublicTocSectionEntries()
    .filter(
      (item) =>
        ALWAYS_RENDERED_PUBLIC_SECTION_IDS.includes(item.id) ||
        (item.public.isPresent?.(article, presence) ?? false),
    )
    .map((item) => ({
      id: item.id,
      label: t(item.label),
      icon: item.icon,
    }));

  return [
    { id: "introduction", label: t("Introduction"), icon: "lucide:file-text" },
    ...articleItems,
    {
      id: "article-status",
      label: t("Article Status"),
      icon: "lucide:shield-check",
    },
    {
      id: "feedback",
      label: t("Feedback"),
      icon: "lucide:message-square-plus",
    },
  ];
}
