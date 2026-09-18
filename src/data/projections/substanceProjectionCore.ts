import { slugify } from "../../utils/slug";
import type {
  SubstanceArticle,
  SubstancePriority as StoredSubstancePriority,
} from "../../schema";

export type PublicSubstancePriority = Exclude<StoredSubstancePriority, "hide_for_now">;

export type SubstanceArticleRecord = Omit<
  SubstanceArticle,
  "priority" | "editorial_review" | "references"
> & {
  slug?: string;
  priority?: StoredSubstancePriority | null;
  editorial_review?: SubstanceArticle["editorial_review"];
  references?: SubstanceArticle["references"];
};

export const normalizeStoredSubstancePriority = (
  priority: SubstanceArticleRecord["priority"],
): StoredSubstancePriority => priority ?? "normal";

export const normalizeSubstancePriority = (
  priority: SubstanceArticleRecord["priority"],
): PublicSubstancePriority => {
  const normalized = normalizeStoredSubstancePriority(priority);
  return normalized === "hide_for_now" ? "low" : normalized;
};

export const resolveSubstanceSlug = (
  article: Pick<SubstanceArticleRecord, "slug" | "title">,
): string => article.slug ?? slugify(article.title);

export const trimSubstanceExcerpt = (value: unknown, maxLength = 200): string => {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

export function isProjectionRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
