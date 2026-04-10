import yaml from "yaml";
import { normalizeArticleInput } from "./yamlParser";
import type { SubstanceArticle } from "@/schema";
import type { SubstanceInfo } from "./types";

function normalizeComparableValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function buildArticleYamlDraft(article: SubstanceArticle): string {
  const normalizedArticle = normalizeArticleInput(article as Record<string, unknown>);
  return yaml.stringify(normalizedArticle, { lineWidth: 0, nullStr: "" });
}

export function findExistingArticleForSubstance(
  articles: readonly SubstanceArticle[],
  substances: readonly SubstanceInfo[],
  selectedSubstanceSlug: string | null,
): SubstanceArticle | null {
  if (!selectedSubstanceSlug) {
    return null;
  }

  const substance = substances.find((entry) => entry.slug === selectedSubstanceSlug);
  if (!substance) {
    return null;
  }

  const substanceName = normalizeComparableValue(substance.name);
  if (!substanceName) {
    return null;
  }

  return (
    articles.find((article) => {
      const title = normalizeComparableValue(article.title);
      if (title && title === substanceName) {
        return true;
      }

      const commonName = normalizeComparableValue(article.identification?.common_name);
      return Boolean(commonName) && commonName === substanceName;
    }) ?? null
  );
}

export function findExistingArticleIndex(
  articles: readonly SubstanceArticle[],
  article: SubstanceArticle,
): number {
  const articleId = parseNumericId(article.id);
  if (articleId !== null) {
    const idMatch = articles.findIndex((candidate) => parseNumericId(candidate.id) === articleId);
    if (idMatch >= 0) {
      return idMatch;
    }
  }

  const title = normalizeComparableValue(article.title);
  if (title) {
    const titleMatch = articles.findIndex(
      (candidate) => normalizeComparableValue(candidate.title) === title,
    );
    if (titleMatch >= 0) {
      return titleMatch;
    }
  }

  const commonName = normalizeComparableValue(article.identification?.common_name);
  if (commonName) {
    return articles.findIndex(
      (candidate) =>
        normalizeComparableValue(candidate.identification?.common_name) === commonName,
    );
  }

  return -1;
}

export function upsertGeneratedArticle(
  articles: readonly SubstanceArticle[],
  article: SubstanceArticle,
): {
  nextArticles: SubstanceArticle[];
  action: "created" | "updated";
  assignedId: number;
  matchedIndex: number | null;
} {
  const existingIndex = findExistingArticleIndex(articles, article);

  if (existingIndex >= 0) {
    const existingId = parseNumericId(articles[existingIndex]?.id) ?? existingIndex + 1;
    const nextArticles = [...articles];
    nextArticles[existingIndex] = { ...article, id: existingId };
    return {
      nextArticles,
      action: "updated",
      assignedId: existingId,
      matchedIndex: existingIndex,
    };
  }

  const maxId = articles.reduce((max, candidate) => {
    const candidateId = parseNumericId(candidate.id);
    return candidateId !== null ? Math.max(max, candidateId) : max;
  }, 0);
  const assignedId = maxId + 1;

  return {
    nextArticles: [...articles, { ...article, id: assignedId }],
    action: "created",
    assignedId,
    matchedIndex: null,
  };
}
