import yaml from "yaml";

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

export function hasExistingHistoryCulture(article) {
  const historyCulture = article.history_culture;
  if (!historyCulture) return false;

  return !!(
    historyCulture.content?.trim() ||
    (historyCulture.sections && historyCulture.sections.length > 0 && historyCulture.sections.some((section) => section.content?.trim()))
  );
}

export function selectArticlesForProcessing(articles, options, quoteBacked = null) {
  let selected = [...articles];
  const notFound = [];

  if (options.substance) {
    selected = selected.filter((article) => getArticleSlug(article) === options.substance);
    if (selected.length === 0) {
      throw new Error(`No article found for slug "${options.substance}"`);
    }
  } else if (options.slugs?.length) {
    const requested = new Set(options.slugs);
    selected = selected.filter((article) => requested.has(getArticleSlug(article)));
    notFound.push(
      ...options.slugs.filter((slug) => !selected.some((article) => getArticleSlug(article) === slug)),
    );
    if (selected.length === 0) {
      throw new Error(`No articles found for slugs: ${options.slugs.join(", ")}`);
    }
  }

  if (quoteBacked instanceof Set) {
    selected = selected.filter((article) => quoteBacked.has(getArticleSlug(article)));
  }

  return { articles: selected, notFound };
}

export function buildUserMessage(article, quotes) {
  const filtered = { ...article };
  delete filtered.history_culture;

  const articleYaml = yaml.stringify(filtered, { lineWidth: 0, nullStr: "" });
  return `## Current Article Context

Below is the current state of the article (history_culture section excluded). Use this to understand what exists elsewhere and avoid duplication.

\`\`\`yaml
${articleYaml}
\`\`\`

## Extracted History & Culture Information

${quotes}

## Instructions

Generate the history_culture section from scratch based on the provided sources.`;
}

export function parseGeneratedYaml(response) {
  const yamlMatch = response.match(/```ya?ml\s*([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1].trim() : response.trim();

  try {
    const parsed = yaml.parse(yamlContent);
    if (parsed.history_culture) {
      return parsed.history_culture;
    }
    if (parsed.content !== undefined || parsed.sections !== undefined) {
      return parsed;
    }
    throw new Error("Invalid history_culture structure - missing expected fields");
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}
