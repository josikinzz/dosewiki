import type { SubstanceArticle } from "../../schema";
import { ensureNormalizedTagList } from "./tagDelimiters";
import {
  fieldConfigs,
  normalizeTagLabel,
  parseId,
  parseTitle,
  readFieldValues,
  toTagKey,
  type ArticleChange,
  type FieldChange,
  type TagField,
  type TagMoveMutation,
  type TagMutation,
  type TagMutationResult,
} from "./tagRegistry.shared";

type ArticleRecord = SubstanceArticle;

const filterValuesByKey = (values: string[], targetKey: string): string[] => {
  return values.filter((value) => toTagKey(value) !== targetKey);
};

const replaceValuesByKey = (values: string[], targetKey: string, nextLabel: string): string[] => {
  return values.map((value) => (toTagKey(value) === targetKey ? nextLabel : value));
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

const applyRename = (
  article: ArticleRecord,
  field: TagField,
  fromTag: string,
  toTag: string,
) => {
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

  if (
    nextValues.length === values.length &&
    nextValues.every((value, index) => value === values[index])
  ) {
    return { article, before: values, after: nextValues, changed: false };
  }

  const nextArticle = fieldConfigs[field].setter(article, nextValues);
  return { article: nextArticle, before: values, after: nextValues, changed: true };
};

const applyDelete = (article: ArticleRecord, field: TagField, tag: string) => {
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

const applyMove = (article: ArticleRecord, mutation: TagMoveMutation) => {
  const normalizedTag = normalizeTagLabel(mutation.tag);
  if (!normalizedTag) {
    return {
      article,
      sourceBefore: [],
      sourceAfter: [],
      targetBefore: [],
      targetAfter: [],
      sourceChanged: false,
      targetChanged: false,
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
    (sourceAfter.length !== sourceBefore.length ||
      sourceAfter.some((value, index) => toTagKey(value) !== toTagKey(sourceBefore[index] ?? "")));
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

export const applyTagMutation = (
  articles: ArticleRecord[],
  mutation: TagMutation,
): TagMutationResult => {
  const nextArticles: ArticleRecord[] = [];
  const changes: ArticleChange[] = [];

  articles.forEach((article, index) => {
    let nextArticle = article;
    const perArticleChanges: FieldChange[] = [];

    if (mutation.type === "rename") {
      const { article: updated, before, after, changed } = applyRename(
        article,
        mutation.field,
        mutation.fromTag,
        mutation.toTag,
      );
      nextArticle = updated;
      if (changed) {
        perArticleChanges.push({ field: mutation.field, before, after });
      }
    } else if (mutation.type === "delete") {
      const { article: updated, before, after, changed } = applyDelete(
        article,
        mutation.field,
        mutation.tag,
      );
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
          perArticleChanges.push({
            field: mutation.sourceField,
            before: sourceBefore,
            after: sourceAfter,
          });
        }
        if (targetChanged) {
          perArticleChanges.push({
            field: mutation.targetField,
            before: targetBefore,
            after: targetAfter,
          });
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
