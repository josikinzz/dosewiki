import type { SubstanceArticle } from "@/schema";
import { getDefaultEditorialReview } from "@/schema";
import { slugify } from "@/utils/slug";
import { useMemo, useState } from "react";
import type { ReviewStatus, SortOrder, SubstanceInfo } from "./types";

const REVIEW_STATUS_FALLBACK: ReviewStatus = getDefaultEditorialReview().status;

function resolveArticleSlug(article: SubstanceArticle): string {
  const explicitSlug = "slug" in article && typeof article.slug === "string"
    ? article.slug.trim()
    : "";

  return explicitSlug || slugify(article.title || article.identification.common_name || "");
}

export function useSubstanceEditorArticleData(articles: SubstanceArticle[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("alpha-asc");
  const [showLowPriority, setShowLowPriority] = useState(false);
  const [selectedSubstanceSlug, setSelectedSubstanceSlug] = useState<string | null>(null);

  const substances = useMemo<SubstanceInfo[]>(() => articles
    .filter((article) => showLowPriority || article.priority !== "low")
    .flatMap((article) => {
      const slug = resolveArticleSlug(article);
      if (!slug) return [];

      return [{
        slug,
        name: article.title || article.identification.common_name || slug,
        reviewStatus: article.editorial_review?.status ?? REVIEW_STATUS_FALLBACK,
      }];
    }), [articles, showLowPriority]);

  const filteredSubstances = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? substances.filter((entry) =>
          entry.name.toLowerCase().includes(query) || entry.slug.toLowerCase().includes(query))
      : [...substances];

    filtered.sort((a, b) => sortOrder === "alpha-desc"
      ? b.name.localeCompare(a.name)
      : a.name.localeCompare(b.name));

    return filtered;
  }, [searchQuery, sortOrder, substances]);

  return {
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    showLowPriority,
    setShowLowPriority,
    selectedSubstanceSlug,
    setSelectedSubstanceSlug,
    substances,
    filteredSubstances,
    totalSubstances: substances.length,
  };
}
