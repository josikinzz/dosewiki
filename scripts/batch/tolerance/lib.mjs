import yaml from "yaml";

export function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

export function hasExistingTolerance(article) {
  const tolerance = article.tolerance;
  if (!tolerance) return false;
  return !!(
    tolerance.full_tolerance?.trim() ||
    tolerance.half_tolerance?.trim() ||
    tolerance.baseline_tolerance?.trim() ||
    tolerance.cross_tolerance?.length > 0
  );
}

export function selectArticlesForProcessing(allArticles, options, quoteSlugs) {
  let articles = allArticles.filter((article) =>
    options.all ? true : article.priority === "high" || article.priority === "normal",
  );
  const candidateCount = articles.length;

  if (options.substance) {
    articles = articles.filter((article) => getArticleSlug(article) === options.substance);
    if (articles.length === 0) {
      throw new Error(`No article found for slug "${options.substance}"`);
    }
  } else if (options.slugs?.length) {
    const requested = new Set(options.slugs);
    articles = articles.filter((article) => requested.has(getArticleSlug(article)));
  }

  const requestedCount = articles.length;
  const notFound = options.slugs?.length
    ? options.slugs.filter((slug) => !articles.some((article) => getArticleSlug(article) === slug))
    : [];

  articles = articles.filter((article) => quoteSlugs.has(getArticleSlug(article)));
  const quoteBackedCount = articles.length;

  if (!options.includeExisting) {
    articles = articles.filter((article) => !hasExistingTolerance(article));
  }
  const incompleteCount = articles.length;

  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
  }

  return {
    articles,
    summary: {
      candidateCount,
      requestedCount,
      quoteBackedCount,
      incompleteCount,
      notFound,
    },
  };
}

export function buildUserMessage(article, quotes) {
  const filtered = { ...article };
  delete filtered.tolerance;
  const articleYaml = yaml.stringify(filtered, { lineWidth: 0, nullStr: "" });

  return `## Current Article Context

Below is the current state of the article (tolerance section excluded). Use this to understand what exists elsewhere and avoid duplication.

\`\`\`yaml
${articleYaml}
\`\`\`

## Extracted Tolerance Information

Generate the tolerance section from scratch based on these sources:

${quotes}

## Instructions

Generate ONLY the tolerance section as valid YAML. Include only tolerance and cross-tolerance information supported by the extracted sources.`;
}

export function parseGeneratedYaml(response) {
  const yamlMatch = response.match(/```ya?ml\s*([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1].trim() : response.trim();

  try {
    const parsed = yaml.parse(yamlContent);
    const tolerance = parsed.tolerance || parsed;
    if (
      tolerance.full_tolerance !== undefined ||
      tolerance.half_tolerance !== undefined ||
      tolerance.baseline_tolerance !== undefined ||
      tolerance.cross_tolerance !== undefined
    ) {
      return {
        full_tolerance: typeof tolerance.full_tolerance === "string" ? tolerance.full_tolerance : "",
        half_tolerance: typeof tolerance.half_tolerance === "string" ? tolerance.half_tolerance : "",
        baseline_tolerance: typeof tolerance.baseline_tolerance === "string" ? tolerance.baseline_tolerance : "",
        cross_tolerance: Array.isArray(tolerance.cross_tolerance)
          ? tolerance.cross_tolerance.filter((entry) => typeof entry === "string")
          : [],
      };
    }
    throw new Error("Invalid tolerance structure - missing expected fields");
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}
