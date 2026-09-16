import { readFileSync } from "node:fs";
import path from "node:path";
import {
  promptRegistry,
  getPromptDescriptorByKey,
} from "./prompt-registry.mjs";

const SECTION_PROMPTS_DIR = "src/data/config/sectionPrompts"

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
