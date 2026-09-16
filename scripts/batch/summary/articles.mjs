import { GREEK_TO_ASCII } from "./config.mjs";

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

export function stripDataMetadata(article) {
  const { _id, _creationTime, ...clean } = article;
  return clean;
}

function sanitizeFieldName(name) {
  let result = name;
  for (const [greek, ascii] of Object.entries(GREEK_TO_ASCII)) {
    result = result.replace(new RegExp(greek, "g"), ascii);
  }
  let asciiResult = "";
  for (let index = 0; index < result.length; index++) {
    const character = result[index];
    asciiResult += character.charCodeAt(0) <= 0x7f ? character : "_";
  }
  return asciiResult;
}

export function sanitizeObjectKeys(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeObjectKeys);
  if (typeof value !== "object") return value;

  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    result[sanitizeFieldName(key)] = sanitizeObjectKeys(nestedValue);
  }
  return result;
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function selectArticles(allArticles, options, availability) {
  let articles = allArticles.filter((article) =>
    options.all ? true : article.priority === "high" || article.priority === "normal",
  );

  if (options.substance) {
    articles = articles.filter((article) => getArticleSlug(article) === options.substance);
  } else if (options.slugs) {
    const wanted = new Set(options.slugs);
    articles = articles.filter((article) => wanted.has(getArticleSlug(article)));
  }

  const withSources = articles.filter((article) => {
    const slug = getArticleSlug(article);
    return availability.summaryQuoteSlugs.has(slug) || availability.articleSourceSlugs.has(slug);
  });

  const missingSourceCoverage = articles.length - withSources.length;
  articles = withSources;

  if (!options.includeExisting) {
    articles = articles.filter(
      (article) => !(typeof article.summary === "string" && article.summary.trim()),
    );
  }

  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
  }

  return {
    articles,
    missingSourceCoverage,
    quotedCount: articles.filter((article) =>
      availability.summaryQuoteSlugs.has(getArticleSlug(article)),
    ).length,
    genericCount: articles.filter(
      (article) => !availability.summaryQuoteSlugs.has(getArticleSlug(article)),
    ).length,
  };
}
