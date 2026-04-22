import yaml from "yaml";
import { estimateTokens, type ReasoningEffortLevel } from "@/utils/api/openrouter";
import type { SectionKey } from "@/data/config/sectionPrompts";
import type { GenerationMode, ReasoningMode } from "./types";

const ADAPTIVE_REASONING_LOW_INPUT_TOKENS = 12000;
const ADAPTIVE_REASONING_MINIMAL_INPUT_TOKENS = 18000;
const ADAPTIVE_REASONING_DISABLE_INPUT_TOKENS = 30000;
const ADAPTIVE_REASONING_LOW_SOURCE_CHARS = 50000;
const ADAPTIVE_REASONING_MINIMAL_SOURCE_CHARS = 80000;
const ADAPTIVE_REASONING_DISABLE_SOURCE_CHARS = 120000;

export interface GenericSource {
  source: string;
  content: string;
}

export function safeEstimateTokens(text: string | null | undefined): number | null {
  if (!text) {
    return 0;
  }

  try {
    return estimateTokens(text);
  } catch {
    return null;
  }
}

export function previewLogText(text: string, maxLength: number = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function hasNonEmptyValues(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).some(
    (entry) =>
      entry !== null &&
      entry !== undefined &&
      entry !== "" &&
      !(Array.isArray(entry) && entry.length === 0) &&
      !(typeof entry === "object" && !hasNonEmptyValues(entry)),
  );
}

export function hasSectionContent(
  currentArticleYaml: string | null,
  sectionKey: SectionKey,
): boolean {
  if (!currentArticleYaml) {
    return false;
  }

  try {
    const parsed = yaml.parse(currentArticleYaml);

    if (sectionKey === "dosage_duration") {
      return hasNonEmptyValues(parsed.dosage) || hasNonEmptyValues(parsed.duration);
    }

    return hasNonEmptyValues(parsed[sectionKey]);
  } catch {
    return false;
  }
}

function getFilteredArticleYaml(fullYaml: string, sectionKey: SectionKey): string {
  try {
    const parsed = yaml.parse(fullYaml);

    if (sectionKey === "dosage_duration") {
      delete parsed.dosage;
      delete parsed.duration;
    } else {
      delete parsed[sectionKey];
    }

    return yaml.stringify(parsed, { lineWidth: 0, nullStr: "" });
  } catch {
    return fullYaml;
  }
}

export function buildSectionGenerationUserMessage({
  currentArticleYaml,
  extractedContent,
  genericSources,
  generationMode,
  sectionKey,
  sectionLabel,
}: {
  currentArticleYaml: string | null;
  extractedContent: string | null;
  genericSources: GenericSource[];
  generationMode: GenerationMode;
  sectionKey: SectionKey;
  sectionLabel: string;
}): string {
  const messageParts: string[] = [];

  if (currentArticleYaml) {
    if (generationMode === "fresh_slate") {
      const filteredYaml = getFilteredArticleYaml(currentArticleYaml, sectionKey);
      messageParts.push(
        `## Current Article Context\n\nBelow is the current state of OTHER sections in the article (the ${sectionLabel} section is excluded). Use this to understand what exists elsewhere and avoid duplication. Generate the ${sectionLabel} section from scratch based on the provided sources.\n\n\`\`\`yaml\n${filteredYaml}\n\`\`\``,
      );
    } else {
      messageParts.push(
        `## Current Article State (Review Mode)\n\nBelow is the current article including the existing ${sectionLabel} section. Review the existing ${sectionLabel} content and improve it where applicable:\n- Enhance clarity and readability\n- Add any missing information from sources\n- Correct any inaccuracies\n- Preserve accurate content that doesn't need changes\n\n\`\`\`yaml\n${currentArticleYaml}\n\`\`\``,
      );
    }
  }

  if (extractedContent) {
    messageParts.push(`## Extracted Source Content for ${sectionLabel}\n\n${extractedContent}`);
  } else if (genericSources.length > 0) {
    const sourcesText = genericSources
      .map(({ source, content }) => `## Source: ${source}\n\n${content}`)
      .join("\n\n---\n\n");
    messageParts.push(sourcesText);
  }

  return messageParts.join("\n\n---\n\n");
}

export function resolveEffectiveReasoningConfig({
  supportsReasoning,
  reasoningMode,
  reasoningEffort,
  extractedContent,
  genericSourceChars,
  totalInputTokenEstimate,
}: {
  supportsReasoning: boolean;
  reasoningMode: ReasoningMode;
  reasoningEffort: ReasoningEffortLevel;
  extractedContent: string | null;
  genericSourceChars: number;
  totalInputTokenEstimate: number | null;
}) {
  if (!supportsReasoning) {
    return {
      enableReasoning: false,
      reasoningEffort: null,
      mode: "unsupported",
      reason: "Current model does not support reasoning.",
    } as const;
  }

  if (reasoningMode === "off") {
    return {
      enableReasoning: false,
      reasoningEffort: null,
      mode: "off",
      reason: "Reasoning is disabled for this run.",
    } as const;
  }

  if (reasoningMode === "force") {
    return {
      enableReasoning: true,
      reasoningEffort,
      mode: "force",
      reason: `Force mode keeps ${reasoningEffort} reasoning for this run.`,
    } as const;
  }

  const extractedContentChars = extractedContent?.length ?? 0;
  const shouldDisableReasoning =
    (totalInputTokenEstimate != null &&
      totalInputTokenEstimate >= ADAPTIVE_REASONING_DISABLE_INPUT_TOKENS) ||
    extractedContentChars >= ADAPTIVE_REASONING_DISABLE_SOURCE_CHARS ||
    genericSourceChars >= ADAPTIVE_REASONING_DISABLE_SOURCE_CHARS;

  if (shouldDisableReasoning) {
    return {
      enableReasoning: false,
      reasoningEffort: null,
      mode: "adaptive-disabled",
      reason: "Adaptive mode disables reasoning only for very large prompts.",
    } as const;
  }

  const shouldUseMinimalReasoning =
    (totalInputTokenEstimate != null &&
      totalInputTokenEstimate >= ADAPTIVE_REASONING_MINIMAL_INPUT_TOKENS) ||
    extractedContentChars >= ADAPTIVE_REASONING_MINIMAL_SOURCE_CHARS ||
    genericSourceChars >= ADAPTIVE_REASONING_MINIMAL_SOURCE_CHARS;

  if (shouldUseMinimalReasoning) {
    return {
      enableReasoning: true,
      reasoningEffort: "minimal",
      mode: "adaptive-minimal",
      reason: "Adaptive mode downgraded reasoning to minimal for this larger prompt.",
    } as const;
  }

  const shouldUseLowReasoning =
    (totalInputTokenEstimate != null &&
      totalInputTokenEstimate >= ADAPTIVE_REASONING_LOW_INPUT_TOKENS) ||
    extractedContentChars >= ADAPTIVE_REASONING_LOW_SOURCE_CHARS ||
    genericSourceChars >= ADAPTIVE_REASONING_LOW_SOURCE_CHARS;

  if (shouldUseLowReasoning) {
    return {
      enableReasoning: true,
      reasoningEffort: "low",
      mode: "adaptive-low",
      reason: "Adaptive mode downgraded reasoning to low for this medium-size prompt.",
    } as const;
  }

  return {
    enableReasoning: true,
    reasoningEffort,
    mode: "adaptive-selected",
    reason: `Adaptive mode kept your selected ${reasoningEffort} effort.`,
  } as const;
}
