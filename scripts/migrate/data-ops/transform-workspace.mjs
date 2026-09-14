import { validateSubstanceArticlePayload } from "../../../lib/substanceArticlePayloadValidation.mjs";

export function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultArticleKey(article, index) { return article?.slug || article?.title || article?.id || `article-${index}`; }

function defaultValidateArticle(article) { if (!article || typeof article !== "object") {
  return {
    ok: false,
    issues: [{ path: "<root>", message: "Article must be an object", code: "invalid_type" }],
  };
}

if (typeof article.title !== "string" || article.title.trim() === "") {
  return {
    ok: false,
    issues: [{ path: "title", message: "Article title is required", code: "required" }],
  };
}

return { ok: true, article, issues: [] }; }

export function validateSubstanceArticleShape(article) {
  return validateSubstanceArticlePayload(article);
}

function createDiffSummary(before, after) { const fields = Array.from(new Set([
  ...Object.keys(before || {}),
  ...Object.keys(after || {}),
])).sort();

const changedFields = [];
for (const field of fields) {
  const beforeValue = before?.[field];
  const afterValue = after?.[field];
  if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
    changedFields.push({
      field,
      before: cloneJson(beforeValue),
      after: cloneJson(afterValue),
    });
  }
}

return {
  changed: changedFields.length > 0,
  changedFields,
}; }

function countDiffFields(changedRecords) { const counts = {};
for (const record of changedRecords) {
  for (const change of record.diff.changedFields) {
    counts[change.field] = (counts[change.field] || 0) + 1;
  }
}
return counts; }

function normalizeTransformResult(result, originalArticle) { if (!result) {
  return { article: originalArticle };
}

if (result.skipped || result.skip) {
  return {
    skipped: result.skipped || result.skip,
    reason: result.reason || result.skipped || result.skip,
    warnings: result.warnings || [],
    metadata: result.metadata || {},
  };
}

if (Object.prototype.hasOwnProperty.call(result, "article")) {
  return {
    article: result.article,
    warnings: result.warnings || [],
    metadata: result.metadata || {},
  };
}

return {
  article: result,
  warnings: [],
  metadata: {},
}; }

function collectArticleSources({ article, index, sourceAdapters }) { const sources = {};
const warnings = [];

for (const [name, adapter] of Object.entries(sourceAdapters || {})) {
  try {
    sources[name] = adapter({ article, index });
  } catch (error) {
    warnings.push({
      source: name,
      message: error instanceof Error ? error.message : String(error),
    });
    sources[name] = undefined;
  }
}

return { sources, warnings }; }

export function createArticleMigrationPlan({
  articles,
  transform,
  sourceAdapters = {},
  validateArticle = defaultValidateArticle,
  getArticleKey = defaultArticleKey,
} = {}) {
  if (!Array.isArray(articles)) {
    throw new TypeError("createArticleMigrationPlan requires an articles array");
  }

  if (typeof transform !== "function") {
    throw new TypeError("createArticleMigrationPlan requires a transform function");
  }

  const changedRecords = [];
  const unchangedRecords = [];
  const skippedRecords = [];
  const warnings = [];
  const validationFailures = [];

  articles.forEach((article, index) => {
    const key = getArticleKey(article, index);
    const title = article?.title || String(key);
    const sourceResult = collectArticleSources({ article, index, sourceAdapters });
    const sourceWarnings = sourceResult.warnings.map((warning) => ({ key, title, ...warning }));
    warnings.push(...sourceWarnings);

    const rawResult = transform({
      article: cloneJson(article),
      originalArticle: article,
      index,
      key,
      sources: sourceResult.sources,
    });
    const result = normalizeTransformResult(rawResult, article);
    const transformWarnings = (result.warnings || []).map((warning) => (
      typeof warning === "string" ? { key, title, message: warning } : { key, title, ...warning }
    ));
    const recordWarnings = [
      ...sourceWarnings,
      ...transformWarnings,
    ];
    warnings.push(...transformWarnings);

    if (result.skipped) {
      skippedRecords.push({
        index,
        key,
        title,
        reason: result.reason,
        warnings: recordWarnings,
        metadata: result.metadata || {},
      });
      return;
    }

    const nextArticle = result.article ?? article;
    const diff = createDiffSummary(article, nextArticle);

    if (!diff.changed) {
      unchangedRecords.push({
        index,
        key,
        title,
        article,
        warnings: recordWarnings,
        metadata: result.metadata || {},
      });
      return;
    }

    const validation = validateArticle(nextArticle);
    if (!validation?.ok) {
      validationFailures.push({
        index,
        key,
        title,
        before: article,
        after: nextArticle,
        diff,
        issues: validation?.issues || [{ path: "<root>", message: "Validation failed", code: "invalid" }],
        warnings: recordWarnings,
        metadata: result.metadata || {},
      });
      return;
    }

    changedRecords.push({
      index,
      key,
      title,
      before: article,
      after: validation.article || nextArticle,
      diff,
      warnings: recordWarnings,
      metadata: result.metadata || {},
    });
  });

  return {
    records: articles,
    changedRecords,
    unchangedRecords,
    skippedRecords,
    warnings,
    validationFailures,
    summary: {
      total: articles.length,
      changed: changedRecords.length,
      unchanged: unchangedRecords.length,
      skipped: skippedRecords.length,
      warnings: warnings.length,
      validationFailures: validationFailures.length,
      diffByField: countDiffFields(changedRecords),
    },
  };
}

export function applyMigrationPlan(plan) {
  const changedByIndex = new Map(plan.changedRecords.map((record) => [record.index, record.after]));
  return plan.records.map((article, index) => {
    return changedByIndex.get(index) || article;
  });
}
