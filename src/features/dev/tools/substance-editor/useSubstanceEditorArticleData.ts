import type { SubstanceArticle } from "@/schema";
import { getDefaultEditorialReview, isDirectUrlOnlySubstance } from "@/schema";
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

export function useSubstanceEditorArticleData(articles: SubstanceArticle[], initialSlug?: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("alpha-asc");
  // A deep link to a URL-only substance would otherwise land on a list that
  // hides it, so the toggle opens in whichever state shows the linked article.
  const [showDirectUrlOnly, setShowDirectUrlOnly] = useState(() =>
    articles.some((article) =>
      resolveArticleSlug(article) === initialSlug && isDirectUrlOnlySubstance(article.priority)));
  const [selectedSubstanceSlug, setSelectedSubstanceSlug] = useState<string | null>(initialSlug ?? null);

  const substances = useMemo<SubstanceInfo[]>(() => articles
    .filter((article) => showDirectUrlOnly || !isDirectUrlOnlySubstance(article.priority))
    .flatMap((article) => {
      const slug = resolveArticleSlug(article);
      if (!slug) return [];

      return [{
        slug,
        name: article.title || article.identification.common_name || slug,
        reviewStatus: article.editorial_review?.status ?? REVIEW_STATUS_FALLBACK,
      }];
    }), [articles, showDirectUrlOnly]);

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

  const selectedSubstance = useMemo(
    () => substances.find((entry) => entry.slug === selectedSubstanceSlug) ?? null,
    [selectedSubstanceSlug, substances],
  );

  return {
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    showDirectUrlOnly,
    setShowDirectUrlOnly,
    selectedSubstanceSlug,
    setSelectedSubstanceSlug,
    selectedSubstance,
    substances,
    filteredSubstances,
    totalSubstances: substances.length,
  };
}
