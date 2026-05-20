import yaml from "yaml";

export function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function hasExistingHistoryCulture(article) {
  const historyCulture = article.history_culture;
  if (!historyCulture) return false;

  return !!(
    historyCulture.content?.trim() ||
    (historyCulture.sections && historyCulture.sections.length > 0 && historyCulture.sections.some((section) => section.content?.trim()))
  );
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

Generate the history_culture section from scratch based on these sources:

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
