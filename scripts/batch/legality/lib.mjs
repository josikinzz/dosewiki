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

export function buildUserMessage(article, quotes) {
  const filtered = { ...article };
  delete filtered.legality;
  const articleYaml = yaml.stringify(filtered, { lineWidth: 0, nullStr: "" });

  return `## Current Article Context

Below is the current state of the article (legality section excluded). Use this to understand what exists elsewhere and avoid duplication.

\`\`\`yaml
${articleYaml}
\`\`\`

## Extracted Legality Information

${quotes}

## Instructions

Generate the legality section from scratch based on the provided sources.`;
}

export function parseGeneratedYaml(response) {
  const yamlMatch = response.match(/```ya?ml\s*([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1].trim() : response.trim();

  try {
    const parsed = yaml.parse(yamlContent);
    if (parsed.legality) {
      return parsed.legality;
    }
    if (parsed.international !== undefined || parsed.countries !== undefined) {
      return parsed;
    }
    throw new Error("Invalid legality structure - missing international or countries");
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}
