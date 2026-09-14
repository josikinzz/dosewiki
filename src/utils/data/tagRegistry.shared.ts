import type { SubstanceArticle } from "../../schema";
import { slugifyDrugName } from "../../data/builders/contentBuilder";
import { ensureNormalizedTagList } from "./tagDelimiters";
import {
  getLegacyAwareMechanismTags,
  normalizePharmacologySection,
} from "../../../lib/article/normalization.mjs";

type ArticleRecord = SubstanceArticle;

/**
 * The minimum a row must carry for `buildTagRegistry` to index it: identity
 * for slug derivation and article refs, plus the four tag fields (the
 * mechanism tag list is read out of `binding_sites`). Whole
 * `SubstanceArticle` rows satisfy it, and so does the bounded tag-registry
 * projection the tag editor drains instead of the corpus.
 */
export type TagRegistryInput = {
  id?: SubstanceArticle["id"];
  title: SubstanceArticle["title"];
  identification: SubstanceArticle["identification"];
  index_categories: SubstanceArticle["index_categories"];
  classification: SubstanceArticle["classification"];
  pharmacology: Pick<SubstanceArticle["pharmacology"], "binding_sites">;
};

export type TagField =
  | "index_categories"
  | "chemical_class"
  | "psychoactive_class"
  | "mechanism_of_action";

export interface TagArticleRef {
  index: number;
  id?: number;
  title?: string;
  slug?: string;
}

export interface TagUsage {
  field: TagField;
  tag: string;
  key: string;
  count: number;
  articleRefs: TagArticleRef[];
}

export interface TagRegistry {
  byField: Record<TagField, TagUsage[]>;
  byKey: Record<TagField, Map<string, TagUsage>>;
}

export interface FieldChange {
  field: TagField;
  before: string[];
  after: string[];
}

export interface ArticleChange {
  index: number;
  id?: number;
  title?: string;
  changes: FieldChange[];
}

export interface TagMutationResult {
  articles: ArticleRecord[];
  changes: ArticleChange[];
}

export type TagRenameMutation = {
  type: "rename";
  field: TagField;
  fromTag: string;
  toTag: string;
};

export type TagMoveMutation = {
  type: "move";
  sourceField: TagField;
  targetField: TagField;
  tag: string;
  renamedTag?: string;
  keepSourceCopy?: boolean;
};

export type TagDeleteMutation = {
  type: "delete";
  field: TagField;
  tag: string;
};

export type TagMutation = TagRenameMutation | TagMoveMutation | TagDeleteMutation;

export const TAG_FIELDS: TagField[] = [
  "index_categories",
  "chemical_class",
  "psychoactive_class",
  "mechanism_of_action",
];

export const TAG_FIELD_LABELS: Record<TagField, string> = {
  index_categories: "Index Categories",
  chemical_class: "Chemical Class",
  psychoactive_class: "Psychoactive Class",
  mechanism_of_action: "Mechanism of Action",
};

type FieldConfig = {
  getter: (article: TagRegistryInput) => string[];
  setter: (article: ArticleRecord, values: string[]) => ArticleRecord;
};

export const normalizeTagLabel = (value: string): string => value.replace(/\s+/g, " ").trim();

export const toTagKey = (value: string): string => normalizeTagLabel(value).toLowerCase();

export const parseId = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

export const parseTitle = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};

export const deriveArticleSlug = (article: TagRegistryInput): string | undefined => {
  const identification = article.identification;

  const commonName = parseTitle(identification?.common_name);
  const title = parseTitle(article.title);
  const substitutiveName = parseTitle(identification?.substitutive_name);
  const iupacName = parseTitle(identification?.iupac_name);

  const candidates = [commonName, title, substitutiveName, iupacName].filter(
    (value): value is string => Boolean(value),
  );
  const baseName = candidates.find((value) => !value.includes("(")) ?? candidates[0];

  const fallbackId = parseId(article.id);
  const fallback = fallbackId !== undefined ? `article-${fallbackId}` : baseName;

  const primary = baseName ?? fallback;
  if (!primary || !fallback) {
    return undefined;
  }

  return slugifyDrugName(primary, fallback);
};

const cloneArticle = (article: ArticleRecord): ArticleRecord => {
  return structuredClone(article);
};

export const fieldConfigs: Record<TagField, FieldConfig> = {
  index_categories: {
    getter: (article) => ensureNormalizedTagList(article.index_categories || []),
    setter: (article, values) => {
      const next = cloneArticle(article);
      next.index_categories = ensureNormalizedTagList(values);
      return next;
    },
  },
  chemical_class: {
    getter: (article) => ensureNormalizedTagList(article.classification?.chemical_class || []),
    setter: (article, values) => {
      const next = cloneArticle(article);
      next.classification = {
        ...next.classification,
        chemical_class: ensureNormalizedTagList(values),
      };
      return next;
    },
  },
  psychoactive_class: {
    getter: (article) => ensureNormalizedTagList(article.classification?.psychoactive_class || []),
    setter: (article, values) => {
      const next = cloneArticle(article);
      next.classification = {
        ...next.classification,
        psychoactive_class: ensureNormalizedTagList(values),
      };
      return next;
    },
  },
  mechanism_of_action: {
    getter: (article) => ensureNormalizedTagList(getLegacyAwareMechanismTags(article.pharmacology)),
    setter: (article, values) => {
      const next = cloneArticle(article);
      const existing = normalizePharmacologySection(next.pharmacology).binding_sites;
      const normalizedValues = ensureNormalizedTagList(values);
      const existingTags = new Set(existing.map((entry) => entry.tag).filter(Boolean));
      const updated = existing
        .map((entry) => {
          if (entry.tag && !normalizedValues.includes(entry.tag)) {
            const { tag: _tag, ...rest } = entry;
            return Object.values(rest).some((value) => value) ? (rest as typeof entry) : null;
          }
          return entry;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      for (const tag of normalizedValues) {
        if (!existingTags.has(tag)) {
          updated.push({ target: tag.split(" receptor")[0] || tag, tag });
        }
      }

      next.pharmacology = {
        ...next.pharmacology,
        binding_sites: updated,
      };
      return next;
    },
  },
};

export const readFieldValues = (article: TagRegistryInput, field: TagField): string[] => {
  const config = fieldConfigs[field];
  return config.getter(article);
};
