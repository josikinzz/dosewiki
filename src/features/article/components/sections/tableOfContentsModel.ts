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

/**
 * Projects the article into the small, serializable model consumed by the TOC
 * disclosure/strip islands. Public routes run this on the server; editor
 * previews use the same projection in their existing client boundary.
 */
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
