import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = "content/prompts/registry.json";

export const promptRegistry = Object.freeze(
  JSON.parse(readFileSync(path.join(PROJECT_ROOT, REGISTRY_PATH), "utf-8")),
);

export const sectionPromptDescriptors = Object.freeze(
  promptRegistry.filter((descriptor) => descriptor.kind === "section"),
);

export const formalCitationPromptDescriptors = Object.freeze(
  promptRegistry.filter((descriptor) => descriptor.kind === "formal_citations_section"),
);

export function getPromptDescriptorByKey(key) {
  return promptRegistry.find((descriptor) => descriptor.dataKey === key);
}

function getSectionPromptDescriptor(sectionKey) { const descriptor = sectionPromptDescriptors.find((entry) => entry.sectionKey === sectionKey);
if (!descriptor) {
  throw new Error(`Unknown section prompt key: ${sectionKey}`);
}
return descriptor; }

export function sectionKeyToPromptKey(sectionKey) {
  return getSectionPromptDescriptor(sectionKey).dataKey;
}

export function getFormalCitationAgentPromptDescriptor() {
  const descriptor = promptRegistry.find((entry) => entry.kind === "formal_citations_agent");
  if (!descriptor) {
    throw new Error("Missing formal citations agent prompt descriptor.");
  }
  return descriptor;
}

function getFormalCitationSectionPromptDescriptor(sectionKey) { const descriptor = formalCitationPromptDescriptors.find(
  (entry) => entry.citationSectionKey === sectionKey,
);
if (!descriptor) {
  throw new Error(`Unknown formal citation section prompt key: ${sectionKey}`);
}
return descriptor; }

export function formalCitationSectionKeyToPromptKey(sectionKey) {
  return getFormalCitationSectionPromptDescriptor(sectionKey).dataKey;
}

export function isKnownPromptKey(key) {
  return Boolean(getPromptDescriptorByKey(key));
}
