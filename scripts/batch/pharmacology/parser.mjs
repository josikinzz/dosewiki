import { writeFileSync } from "fs";
import { join } from "path";

import yaml from "yaml";

import { normalizePharmacologySection } from "../../../lib/article/normalization.mjs";
import { CONFIG } from "./cli.mjs";
import {
  extractParsedPharmacology,
  extractPharmacologyYaml,
  repairCommonYamlIssues,
} from "./lib.mjs";
import { writeOpenRouterDebugArtifact } from "./openrouter.mjs";

export function buildUserMessage(article, quotes) {
  const context = {
    title: article.title,
    psychoactive_class: article.classification?.psychoactive_class || [],
    chemical_class: article.classification?.chemical_class || [],
  };

  return `## Substance

**${context.title}**
- Psychoactive class: ${context.psychoactive_class.join(", ") || "Unknown"}
- Chemical class: ${context.chemical_class.join(", ") || "Unknown"}

## Source Material

Generate the pharmacology section based on these extracted quotes:

${quotes}

## Instructions

Generate ONLY the pharmacology section as valid YAML. Do not include information that belongs in other sections (harm_potential, interactions, tolerance, dosage, duration, legality, subjective_effects).`;
}

function writeParseDebugArtifacts({ debugContext, response, yamlContent, repairedYamlContent, errorMessage }) {
  if (!debugContext?.slug) {
    return;
  }

  const baseName = `${debugContext.slug.replace(/[^a-z0-9_-]+/gi, "_")}-pharmacology-parse-failure`;
  const rawPath = join(CONFIG.debugDir, `${baseName}-raw.txt`);
  const yamlPath = join(CONFIG.debugDir, `${baseName}-yaml.txt`);
  const metaPath = join(CONFIG.debugDir, `${baseName}-meta.json`);

  writeFileSync(rawPath, `${response ?? ""}`, "utf8");
  writeFileSync(yamlPath, `${repairedYamlContent || yamlContent || ""}`, "utf8");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        slug: debugContext.slug,
        title: debugContext.title,
        errorMessage,
        rawPath,
        yamlPath,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function parseGeneratedYaml(response, debugContext = null) {
  const yamlContent = extractPharmacologyYaml(response);
  const parseAttempts = [yamlContent, repairCommonYamlIssues(yamlContent)].filter(
    (content, index, arr) => content && arr.indexOf(content) === index,
  );

  let lastError = null;
  for (const content of parseAttempts) {
    try {
      const parsed = yaml.parse(content, { uniqueKeys: false });
      const pharmacology = extractParsedPharmacology(parsed);
      if (pharmacology) {
        return normalizePharmacologySection(pharmacology);
      }
      lastError = new Error("Invalid pharmacology structure - missing expected fields");
    } catch (error) {
      lastError = error;
    }
  }

  writeOpenRouterDebugArtifact({
    debugContext,
    suffix: "pharmacology-parse-failure-raw",
    payload: response,
    metadata: { errorMessage: lastError?.message ?? "Unknown parse failure" },
  });
  writeParseDebugArtifacts({
    debugContext,
    response,
    yamlContent,
    repairedYamlContent: parseAttempts[1] && parseAttempts[1] !== yamlContent ? parseAttempts[1] : null,
    errorMessage: lastError?.message ?? "Unknown parse failure",
  });

  throw new Error(`Failed to parse YAML: ${lastError?.message ?? "Unknown parse failure"}`);
}
