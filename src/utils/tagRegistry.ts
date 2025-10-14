import articlesSource from "../data/articles.json";
import { ensureNormalizedTagList, joinNormalizedValues } from "./articleDraftForm";

type ArticleRecord = (typeof articlesSource)[number];

export type TagField = "categories" | "chemical_class" | "psychoactive_class" | "mechanism_of_action";

export interface TagArticleRef {
  index: number;
  id?: number;
  title?: string;
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
  "categories",
  "chemical_class",
  "psychoactive_class",
  "mechanism_of_action",
];

export const TAG_FIELD_LABELS: Record<TagField, string> = {
  categories: "Categories",
  chemical_class: "Chemical Class",
  psychoactive_class: "Psychoactive Class",
  mechanism_of_action: "Mechanism of Action",
};

type FieldConfig = {
  kind: "array" | "string";
  getter: (article: ArticleRecord) => unknown;
  setter: (article: ArticleRecord, values: string[]) => ArticleRecord;
};

export const normalizeTagLabel = (value: string): string => value.replace(/\s+/g, " ").trim();

export const toTagKey = (value: string): string => normalizeTagLabel(value).toLowerCase();

const parseId = (value: unknown): number | undefined => {
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

const parseTitle = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};

const toTrimmedArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (typeof entry === "number" && Number.isFinite(entry)) {
          return entry.toString();
        }
        return "";
      })
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n+/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
};

const parseDelimitedField = (value: unknown, delimiter: RegExp): string[] => {
  if (Array.isArray(value)) {
    return ensureNormalizedTagList(toTrimmedArray(value));
  }

  if (typeof value !== "string") {
    return [];
  }

  const normalizedSource = value.replace(/\r?\n+/g, ";");
  const entries = normalizedSource
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return ensureNormalizedTagList(entries);
};

const parseMechanismField = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return ensureNormalizedTagList(toTrimmedArray(value));
  }

  if (typeof value !== "string") {
    return [];
  }

  const entries = value
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return ensureNormalizedTagList(entries);
};

const cloneArticle = (article: ArticleRecord): ArticleRecord => {
  return {
    ...article,
    drug_info: {
      ...(article.drug_info ?? {}),
    },
  } as ArticleRecord;
};

const fieldConfigs: Record<TagField, FieldConfig> = {
  categories: {
    kind: "array",
    getter: (article) => article.drug_info?.categories,
    setter: (article, values) => {
      const next = cloneArticle(article);
      next.drug_info = {
        ...(next.drug_info ?? {}),
        categories: ensureNormalizedTagList(values),
      };
      return next;
    },
  },
  chemical_class: {
    kind: "string",
    getter: (article) => article.drug_info?.chemical_class,
    setter: (article, values) => {
      const normalized = ensureNormalizedTagList(values);
      const next = cloneArticle(article);
      next.drug_info = {
        ...(next.drug_info ?? {}),
        chemical_class: normalized.length > 0 ? joinNormalizedValues(normalized, ", ") : "",
      };
      return next;
    },
  },
  psychoactive_class: {
    kind: "string",
    getter: (article) => article.drug_info?.psychoactive_class,
    setter: (article, values) => {
      const normalized = ensureNormalizedTagList(values);
      const next = cloneArticle(article);
      next.drug_info = {
        ...(next.drug_info ?? {}),
        psychoactive_class: normalized.length > 0 ? joinNormalizedValues(normalized, ", ") : "",
      };
      return next;
    },
  },
  mechanism_of_action: {
    kind: "string",
    getter: (article) => article.drug_info?.mechanism_of_action,
    setter: (article, values) => {
      const normalized = ensureNormalizedTagList(values);
      const next = cloneArticle(article);
      next.drug_info = {
        ...(next.drug_info ?? {}),
        mechanism_of_action: normalized.length > 0 ? joinNormalizedValues(normalized, "; ") : "",
      };
      return next;
    },
  },
};

const readFieldValues = (article: ArticleRecord, field: TagField): string[] => {
  const config = fieldConfigs[field];
  const raw = config.getter(article);

  switch (field) {
    case "categories":
      return ensureNormalizedTagList(toTrimmedArray(raw));
    case "chemical_class":
    case "psychoactive_class":
      return parseDelimitedField(raw, /[;,/]/);
    case "mechanism_of_action":
      return parseMechanismField(raw);
    default:
      return [];
  }
};

export const buildTagRegistry = (articles: ArticleRecord[]): TagRegistry => {
  const byField: Record<TagField, TagUsage[]> = {
    categories: [],
    chemical_class: [],
    psychoactive_class: [],
    mechanism_of_action: [],
  };

  const byKey: Record<TagField, Map<string, TagUsage>> = {
    categories: new Map(),
    chemical_class: new Map(),
    psychoactive_class: new Map(),
    mechanism_of_action: new Map(),
  };

  articles.forEach((article, index) => {
    const id = parseId(article.id);
    const title = parseTitle(article.title);

    TAG_FIELDS.forEach((field) => {
      const values = readFieldValues(article, field);
      if (values.length === 0) {
        return;
      }

      const seen = new Set<string>();

      values.forEach((value) => {
        const label = normalizeTagLabel(value);
        if (!label) {
          return;
        }

        const key = toTagKey(label);
        if (!byKey[field].has(key)) {
          byKey[field].set(key, {
            field,
            tag: label,
            key,
            count: 0,
            articleRefs: [],
          });
        }

        const usage = byKey[field].get(key)!;

        if (!seen.has(key)) {
          usage.count += 1;
          usage.articleRefs.push({ index, id, title });
          seen.add(key);
        }

        if (usage.tag !== label) {
          // Preserve the earliest stored label but allow new casing if original was empty
          if (usage.tag.trim().length === 0) {
            usage.tag = label;
          }
        }
      });
    });
  });

  TAG_FIELDS.forEach((field) => {
    byField[field] = Array.from(byKey[field].values()).sort((a, b) => a.tag.localeCompare(b.tag));
  });

  return { byField, byKey };
};

const filterValuesByKey = (values: string[], targetKey: string): string[] => {
  return values.filter((value) => toTagKey(value) !== targetKey);
};

const replaceValuesByKey = (values: string[], targetKey: string, nextLabel: string): string[] => {
  return values.map((value) => {
    if (toTagKey(value) === targetKey) {
      return nextLabel;
    }
    return value;
  });
};

const upsertValue = (values: string[], label: string): string[] => {
  const key = toTagKey(label);
  let replaced = false;

  const next = values.map((value) => {
    if (toTagKey(value) === key) {
      replaced = true;
      return label;
    }
    return value;
  });

  if (!replaced) {
    next.push(label);
  }

  return ensureNormalizedTagList(next);
};

const applyRename = (article: ArticleRecord, field: TagField, fromTag: string, toTag: string): {
  article: ArticleRecord;
  before: string[];
  after: string[];
  changed: boolean;
} => {
  const normalizedFrom = normalizeTagLabel(fromTag);
  const normalizedTo = normalizeTagLabel(toTag);
  if (!normalizedFrom || !normalizedTo) {
    return { article, before: [], after: [], changed: false };
  }

  const values = readFieldValues(article, field);
  if (values.length === 0) {
    return { article, before: values, after: values, changed: false };
  }

  const fromKey = toTagKey(normalizedFrom);
  const nextValues = ensureNormalizedTagList(replaceValuesByKey(values, fromKey, normalizedTo));

  if (nextValues.length === values.length && nextValues.every((value, index) => value === values[index])) {
    return { article, before: values, after: nextValues, changed: false };
  }

  const nextArticle = fieldConfigs[field].setter(article, nextValues);
  return { article: nextArticle, before: values, after: nextValues, changed: true };
};

const applyDelete = (article: ArticleRecord, field: TagField, tag: string): {
  article: ArticleRecord;
  before: string[];
  after: string[];
  changed: boolean;
} => {
  const normalized = normalizeTagLabel(tag);
  if (!normalized) {
    return { article, before: [], after: [], changed: false };
  }
  const values = readFieldValues(article, field);
  if (values.length === 0) {
    return { article, before: values, after: values, changed: false };
  }

  const targetKey = toTagKey(normalized);
  const nextValues = ensureNormalizedTagList(filterValuesByKey(values, targetKey));
  if (nextValues.length === values.length) {
    return { article, before: values, after: nextValues, changed: false };
  }

  const nextArticle = fieldConfigs[field].setter(article, nextValues);
  return { article: nextArticle, before: values, after: nextValues, changed: true };
};

const applyMove = (
  article: ArticleRecord,
  mutation: TagMoveMutation,
): {
  article: ArticleRecord;
  sourceBefore: string[];
  sourceAfter: string[];
  targetBefore: string[];
  targetAfter: string[];
  sourceChanged: boolean;
  targetChanged: boolean;
  changed: boolean;
} => {
  const normalizedTag = normalizeTagLabel(mutation.tag);
  if (!normalizedTag) {
    return {
      article,
      sourceBefore: [],
      sourceAfter: [],
      targetBefore: [],
      targetAfter: [],
      changed: false,
    };
  }

  const sourceBefore = readFieldValues(article, mutation.sourceField);
  const targetBefore = readFieldValues(article, mutation.targetField);

  const tagKey = toTagKey(normalizedTag);
  const keepCopy = Boolean(mutation.keepSourceCopy);

  let sourceAfter = sourceBefore;
  if (!keepCopy) {
    sourceAfter = ensureNormalizedTagList(filterValuesByKey(sourceBefore, tagKey));
  }

  const destinationLabel = normalizeTagLabel(mutation.renamedTag ?? mutation.tag);
  let targetAfter = targetBefore;
  if (destinationLabel) {
    targetAfter = upsertValue(targetBefore, destinationLabel);
  }

  const sourceChanged =
    !keepCopy &&
    (sourceAfter.length !== sourceBefore.length || sourceAfter.some((value, index) => toTagKey(value) !== toTagKey(sourceBefore[index] ?? "")));
  const targetChanged =
    targetAfter.length !== targetBefore.length ||
    targetAfter.some((value, index) => toTagKey(value) !== toTagKey(targetBefore[index] ?? ""));

  if (!sourceChanged && !targetChanged) {
    return {
      article,
      sourceBefore,
      sourceAfter,
      targetBefore,
      targetAfter,
      sourceChanged,
      targetChanged,
      changed: false,
    };
  }

  let nextArticle = article;
  if (sourceChanged) {
    nextArticle = fieldConfigs[mutation.sourceField].setter(nextArticle, sourceAfter);
  }
  if (targetChanged) {
    nextArticle = fieldConfigs[mutation.targetField].setter(nextArticle, targetAfter);
  }

  return {
    article: nextArticle,
    sourceBefore,
    sourceAfter,
    targetBefore,
    targetAfter,
    sourceChanged,
    targetChanged,
    changed: true,
  };
};

export const applyTagMutation = (articles: ArticleRecord[], mutation: TagMutation): TagMutationResult => {
  const nextArticles: ArticleRecord[] = [];
  const changes: ArticleChange[] = [];

  articles.forEach((article, index) => {
    let nextArticle = article;
    const perArticleChanges: FieldChange[] = [];

    if (mutation.type === "rename") {
      const { article: updated, before, after, changed } = applyRename(article, mutation.field, mutation.fromTag, mutation.toTag);
      nextArticle = updated;
      if (changed) {
        perArticleChanges.push({ field: mutation.field, before, after });
      }
    } else if (mutation.type === "delete") {
      const { article: updated, before, after, changed } = applyDelete(article, mutation.field, mutation.tag);
      nextArticle = updated;
      if (changed) {
        perArticleChanges.push({ field: mutation.field, before, after });
      }
    } else if (mutation.type === "move") {
      const {
        article: updated,
        sourceBefore,
        sourceAfter,
        targetBefore,
        targetAfter,
        sourceChanged,
        targetChanged,
        changed,
      } = applyMove(article, mutation);
      nextArticle = updated;
      if (changed) {
        if (sourceChanged) {
          perArticleChanges.push({ field: mutation.sourceField, before: sourceBefore, after: sourceAfter });
        }
        if (targetChanged) {
          perArticleChanges.push({ field: mutation.targetField, before: targetBefore, after: targetAfter });
        }
      }
    }

    nextArticles.push(nextArticle);

    if (perArticleChanges.length > 0) {
      changes.push({
        index,
        id: parseId(article.id),
        title: parseTitle(article.title),
        changes: perArticleChanges,
      });
    }
  });

  return { articles: nextArticles, changes };
};

export const summarizeMutation = (result: TagMutationResult) => {
  const affectedCount = result.changes.length;
  const fields = new Set<TagField>();
  result.changes.forEach((change) => {
    change.changes.forEach((entry) => fields.add(entry.field));
  });
  return {
    affectedCount,
    fields: Array.from(fields),
  };
};

export const getTagUsage = (
  registry: TagRegistry,
  field: TagField,
  keyOrLabel: string,
): TagUsage | undefined => {
  const key = toTagKey(keyOrLabel);
  return registry.byKey[field].get(key);
};

export const buildEmptyRegistry = (): TagRegistry => ({
  byField: {
    categories: [],
    chemical_class: [],
    psychoactive_class: [],
    mechanism_of_action: [],
  },
  byKey: {
    categories: new Map(),
    chemical_class: new Map(),
    psychoactive_class: new Map(),
    mechanism_of_action: new Map(),
  },
});

export const sortUsagesByCount = (usages: TagUsage[]): TagUsage[] => {
  return [...usages].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.tag.localeCompare(b.tag);
  });
};
