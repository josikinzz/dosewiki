import { readFileSync } from "node:fs";
import path from "node:path";
import { createEmptyArticle } from "../../src/data/schema/defaults.generated.ts";
import { projectPublicArticle } from "../../src/schema/substance/editorialReviewVisibilityPolicy.ts";
import {
  promptRegistry,
  getPromptDescriptorByKey,
} from "./prompt-registry.mjs";

const SECTION_PROMPTS_DIR = "content/prompts/sections"

export const PROMPT_DRIFT_STATUS = Object.freeze({
  IDENTICAL: "identical",
  MISSING_IN_SOURCE: "missing-in-source",
  MISSING_IN_TARGET: "missing-in-target",
  CONTENT_DIFFERENT: "content-different",
  SAFE_POLICY_DIFFERENCE: "safe-policy-difference",
  REVIEW_REQUIRED: "review-required",
});

export const META_COMMENTARY_RULE =
  "- Do not reference or comment on sources; present information directly without meta-commentary";

export function sectionFileToPromptKey(fileName) {
  const seedPath = path.join(SECTION_PROMPTS_DIR, fileName);
  const descriptor = promptRegistry.find((entry) => entry.seedPath === seedPath);
  if (!descriptor) {
    throw new Error(`No prompt registry descriptor for section prompt file: ${fileName}`);
  }
  return descriptor.dataKey;
}

function promptKeyToKind(key) { const descriptor = getPromptDescriptorByKey(key);
if (descriptor) return descriptor.kind;
return "runtime"; }

function composeGeneratorPrompt(seed, prompts) {
  const sections = promptRegistry.filter((entry) => entry.kind === "section");
  const contracts = sections.map((descriptor) => {
    const prompt = prompts.get(descriptor.dataKey);
    if (!prompt?.content?.trim()) {
      throw new Error(`Generator composition requires ${descriptor.seedPath}`);
    }
    return `## Section contract: ${descriptor.dataKey}\nSource: ${descriptor.seedPath}\n\n${prompt.content.trim()}`;
  });
  const retainedHeadings = new Set([
    "Context", "Style", "Critical Constraints", "Core Principles",
    "Naming Conventions", "Formatting Rules", "Output Contract",
  ]);
  const retainedSeed = seed.split(/(?=^## )/m)
    .filter((section) => retainedHeadings.has(section.match(/^## (.+)$/m)?.[1]))
    .join("\n").trim();
  if (!retainedSeed) throw new Error("Generator seed is missing its shared article guidance");
  const retainedFieldHeadings = new Set(["Top-Level Fields", "Comparisons", "Reagent Testing", "Citations"]);
  const retainedFields = seed.split(/(?=^## )/m)
    .find((section) => section.startsWith("## Field Definitions\n"))
    ?.split(/(?=^### )/m)
    .filter((section) => retainedFieldHeadings.has(section.match(/^### (.+)$/m)?.[1]))
    .join("\n").trim();
  if (!retainedFields) throw new Error("Generator seed is missing its unsectioned field contracts");

  // The generated defaults carry the root shape; registered section contracts
  // supply populated nested shapes. Keep editorial metadata outside generation.
  const defaults = projectPublicArticle(createEmptyArticle());
  return `# Dose.wiki whole-article generation contract

Composed by scripts/lib/prompt-drift-policy.mjs from the registry-owned generator seed's shared guidance and unsectioned field contracts, registered section seeds, and src/data/schema/defaults.generated.ts. The defaults are produced by scripts/generate/generateSchemaUtils.ts from the substance schema; refresh them through that producer when the schema changes. The seed's old whole-article schema, superseded section definitions, checklist, and tag inventory are not generation authorities.

You receive all instructions and evidence in this conversation. You have no tools, filesystem, or web access. Source paths below identify provenance, not files to open. Read every supplied source excerpt; missing or unreadable sources remain evidence gaps.

## Retained article guidance

${retainedSeed}

## Fields without registered section prompts

${retainedFields}

## Current section contracts

Apply each contract to its own fields. Their section-only output instructions define the section boundary, not separate replies. Use their current vocabulary rather than the legacy generator tag list. Examples are not evidence. The article evidence-only rule remains strict: do not infer, extrapolate, or manufacture missing values. Current section contracts own populated field shapes and meaning; the generated defaults supply the article's empty root structure. Evidence/empty-value rules still apply.

${contracts.join("\n\n---\n\n")}

## Generated empty article structure

This JSON object shows the empty article structure, not a JSON Schema or an instruction to return JSON. Fill its fields using the rendered section contracts, which supply nested array/map entry shapes. Keep unsupported values in their shown empty form. Do not generate editorial_review or approval state. For fields without a rendered populated shape, retain their empty form rather than inventing keys or citation metadata.

\`\`\`json
${JSON.stringify(defaults, null, 2)}
\`\`\`

## Whole-article completion

Return one complete raw YAML document, without fences or commentary. Preserve source-supported identifiers character-for-character and existing naming conventions. Cite the exact inspected source supporting each claim; every numerical claim needs a citation. Prefer DOI URLs for inspected academic papers, include only sources actually used, and alphabetize source citations by name. A bibliography mention is not evidence that its underlying paper was inspected. Leave unsupported fields empty rather than inventing content. Check the combined document against every applicable field/section contract and the generated empty structure before returning it. This output is a draft, not authorization to publish or write data.`;
}

export function collectLocalPromptInventory({
  rootDir = process.cwd(),
  readFile = readFileSync,
  onError = (message) => console.error(message),
} = {}) {
  const prompts = new Map();

  for (const descriptor of promptRegistry) {
    if (!descriptor.seedPath) continue;

    try {
      const content = readFile(path.join(rootDir, descriptor.seedPath), "utf-8");
      prompts.set(descriptor.dataKey, {
        key: descriptor.dataKey,
        kind: descriptor.kind,
        sectionKey: descriptor.sectionKey,
        label: descriptor.label,
        content,
        file: path.basename(descriptor.seedPath),
        filePath: descriptor.seedPath,
      });
    } catch (error) {
      onError(`Error reading ${descriptor.dataKey} prompt seed: ${error.message}`);
    }
  }

  const generator = prompts.get("generator");
  if (generator) {
    // Both comparison and migration consume this same rendered content. Never
    // fall back to the obsolete raw seed when a required contract is missing.
    generator.content = composeGeneratorPrompt(generator.content, prompts);
  }

  return prompts;
}

export function collectDataPromptInventory(records) {
  return new Map(records.map((record) => [
    record.key,
    {
      key: record.key,
      kind: promptKeyToKind(record.key),
      content: record.content,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    },
  ]));
}

function classifyPromptContentDrift(source, target, policyRules = defaultPromptDriftPolicyRules) { if (source.content === target.content) {
  return {
    status: PROMPT_DRIFT_STATUS.IDENTICAL,
    recommendation: "identical",
  };
}

for (const rule of policyRules) {
  const result = rule(source, target);
  if (result) return result;
}

return {
  status: PROMPT_DRIFT_STATUS.CONTENT_DIFFERENT,
  recommendation: "review-required",
  policy: null,
}; }

function metaCommentaryRuleDifference(source, target) { const sourceHasRule = source.content.includes(META_COMMENTARY_RULE);
const targetHasRule = target.content.includes(META_COMMENTARY_RULE);
const charDiff = source.content.length - target.content.length;

if (sourceHasRule && !targetHasRule && charDiff > 0 && charDiff < 200) {
  return {
    status: PROMPT_DRIFT_STATUS.SAFE_POLICY_DIFFERENCE,
    recommendation: "safe-to-sync",
    policy: "meta-commentary-rule-added-locally",
  };
}

if (!sourceHasRule && targetHasRule) {
  return {
    status: PROMPT_DRIFT_STATUS.REVIEW_REQUIRED,
    recommendation: "review-required",
    policy: "meta-commentary-rule-missing-locally",
  };
}

return null; }

const defaultPromptDriftPolicyRules = [
  metaCommentaryRuleDifference,
]

export function comparePromptInventories(sourcePrompts, targetPrompts, {
  targetFilter = (prompt) => prompt.kind !== "runtime",
  policyRules = defaultPromptDriftPolicyRules,
} = {}) {
  const targetRemaining = new Map(targetPrompts);
  const drift = [];

  for (const [key, source] of [...sourcePrompts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const target = targetRemaining.get(key);

    if (!target) {
      drift.push({
        key,
        kind: source.kind,
        status: PROMPT_DRIFT_STATUS.MISSING_IN_TARGET,
        source,
        target: null,
      });
      continue;
    }

    const classification = classifyPromptContentDrift(source, target, policyRules);
    drift.push({
      key,
      kind: source.kind,
      status: classification.status,
      recommendation: classification.recommendation,
      policy: classification.policy,
      source,
      target,
    });
    targetRemaining.delete(key);
  }

  for (const [key, target] of [...targetRemaining.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!targetFilter(target)) continue;

    drift.push({
      key,
      kind: target.kind,
      status: PROMPT_DRIFT_STATUS.MISSING_IN_SOURCE,
      source: null,
      target,
    });
  }

  return drift;
}

export function groupPromptDriftByStatus(drift) {
  return Object.fromEntries(
    Object.values(PROMPT_DRIFT_STATUS).map((status) => [
      status,
      drift.filter((entry) => entry.status === status),
    ]),
  );
}

export function collectLocalPromptsForMigration(options = {}) {
  return [...collectLocalPromptInventory(options).values()].map(({ key, content, filePath }) => ({
    key,
    content,
    filePath,
  }));
}
