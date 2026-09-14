import yaml from "yaml";

function repairCommonYamlIssues(yamlContent) {
  return yamlContent
    .split(/\r?\n/)
    .map((line) => {
      const quotedScalarMatch = line.match(/^(\s*[^:#][^:]*:\s*)"([^"\n]*)$/);
      if (quotedScalarMatch) {
        return `${quotedScalarMatch[1]}${quotedScalarMatch[2]}`;
      }
      return line;
    })
    .join("\n");
}

function extractSummaryYaml(response) {
  const withoutThinkBlocks = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const yamlMatch = withoutThinkBlocks.match(/```ya?ml\s*([\s\S]*?)```/i);
  if (yamlMatch) {
    return yamlMatch[1].trim();
  }

  const lines = withoutThinkBlocks.split(/\r?\n/);
  const firstRelevantLine = lines.findIndex((line) => /^summary\s*:/i.test(line.trim()));
  if (firstRelevantLine === -1) {
    return withoutThinkBlocks;
  }

  return lines.slice(firstRelevantLine).join("\n").trim();
}

function normalizeSummaryString(summary) {
  return summary.replace(/\s+/g, " ").trim();
}

function validateSummaryString(summary) {
  const normalized = normalizeSummaryString(summary);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (!normalized) {
    throw new Error("Summary is empty");
  }

  if (words.length < 35 || words.length > 120) {
    throw new Error(`Summary word count ${words.length} is outside the accepted batch range`);
  }

  if (
    /(provided excerpts|provided sources|according to the sources|based on the provided|the excerpts describe)/i.test(
      normalized,
    )
  ) {
    throw new Error("Summary contains source-meta commentary");
  }

  return normalized;
}

export function parseGeneratedSummary(response, debugContext = null, writeDebugArtifact = () => {}) {
  const yamlContent = extractSummaryYaml(response);
  const parseAttempts = [yamlContent, repairCommonYamlIssues(yamlContent)].filter(
    (content, index, arr) => content && arr.indexOf(content) === index,
  );

  let lastError = null;
  for (const candidate of parseAttempts) {
    try {
      const parsed = yaml.parse(candidate, { uniqueKeys: false });
      const value =
        typeof parsed === "string"
          ? parsed
          : parsed && typeof parsed === "object" && typeof parsed.summary === "string"
            ? parsed.summary
            : null;

      if (typeof value === "string") {
        return validateSummaryString(value);
      }

      lastError = new Error("Missing string summary field");
    } catch (error) {
      lastError = error;
    }
  }

  writeDebugArtifact({
    slug: debugContext?.slug,
    suffix: "summary-parse-failure",
    payload: response,
    metadata: {
      title: debugContext?.title,
      yamlContent,
      errorMessage: lastError?.message ?? "Unknown parse failure",
    },
  });

  throw new Error(`Failed to parse YAML: ${lastError?.message ?? "Unknown parse failure"}`);
}
