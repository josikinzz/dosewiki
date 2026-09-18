import { api } from "../../lib/postgres/runtime/api.ts"
import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";
import {
  buildFormalCitationSectionResponseContract,
  parseFormalCitationSectionResponse,
} from "./formal-citations-contract.mjs";
import {
  formalCitationSectionKeyToPromptKey,
  getFormalCitationAgentPromptDescriptor,
} from "../lib/prompt-registry.mjs";
import {
  getFormalCitationSectionConfig,
  normalizeFormalCitationSectionKey,
  resolveFormalCitationSections,
} from "./formal-citations-section-config.mjs";
import { buildFormalCitationTargets } from "./formal-citations-targets.mjs";
import {
  buildFormalCitationSourcePacket,
  loadFormalCitationQuoteDocument,
  summarizeAllowedReferences,
} from "./formal-citations-source-resolver.mjs";

export { buildFormalCitationSourcePacket } from "./formal-citations-source-resolver.mjs";

export const DEFAULT_FORMAL_CITATIONS_MODEL = "deepseek/deepseek-v4-pro";
export const DEFAULT_REASONING_EFFORT = "high";

function parseCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeReasoningEffort(value) {
  if (value == null || value === "") return DEFAULT_REASONING_EFFORT;
  if (value === "off" || value === "none") return null;
  return value;
}

export function parseFormalCitationsOptions(argv) {
  const options = {
    slug: "2c-b",
    write: false,
    approvedWriteMode: "preserve",
    refreshApproved: false,
    replaceApproved: false,
    model: DEFAULT_FORMAL_CITATIONS_MODEL,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    disableReasoning: false,
    section: null,
    sections: [],
    resume: true,
    artifactsDir: null,
    wikipediaEnrichment: true,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--refresh-approved") {
      options.approvedWriteMode = "refresh";
      options.refreshApproved = true;
      options.replaceApproved = false;
    } else if (arg === "--replace-approved") {
      options.approvedWriteMode = "replace";
      options.refreshApproved = true;
      options.replaceApproved = true;
    } else if (arg.startsWith("--slug=")) {
      options.slug = arg.split("=")[1] || options.slug;
    } else if (arg.startsWith("--model=")) {
      options.model = arg.split("=")[1] || options.model;
    } else if (arg.startsWith("--reasoning-effort=")) {
      options.reasoningEffort = normalizeReasoningEffort(arg.split("=")[1]);
    } else if (arg === "--disable-reasoning") {
      options.disableReasoning = true;
      options.reasoningEffort = null;
    } else if (arg.startsWith("--section=")) {
      options.section = arg.split("=")[1] || null;
    } else if (arg.startsWith("--sections=")) {
      options.sections = parseCsv(arg.split("=")[1]);
    } else if (arg === "--resume") {
      options.resume = true;
    } else if (arg === "--no-resume") {
      options.resume = false;
    } else if (arg.startsWith("--artifacts-dir=")) {
      options.artifactsDir = arg.split("=")[1] || null;
    } else if (arg === "--wikipedia-enrichment=off") {
      options.wikipediaEnrichment = false;
    } else if (arg === "--wikipedia-enrichment=on") {
      options.wikipediaEnrichment = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return options;
}

export function resolveRequestedFormalCitationSections({ article, options }) {
  return resolveFormalCitationSections({
    article,
    requestedSection: options.section,
    requestedSections: options.sections,
  });
}

export async function loadFormalCitationPrompts(sourceClient, sectionKeys) {
  const keys = [
    getFormalCitationAgentPromptDescriptor().dataKey,
    ...sectionKeys.map((sectionKey) => formalCitationSectionKeyToPromptKey(sectionKey)),
  ];

  const prompts = await Promise.all(
    keys.map(async (key) => {
      const prompt = await sourceClient.query(api.prompts.getByKey, { key });
      if (!prompt?.content) {
        throw new Error(`${key} prompt not found in Postgres. Run npm run prompts:migrate first.`);
      }
      return [key, prompt.content];
    }),
  );

  return Object.fromEntries(prompts);
}

function getSectionArticleSnapshot(article, sectionKey) {
  switch (normalizeFormalCitationSectionKey(sectionKey)) {
    case "summary":
      return article?.summary ?? "";
    case "pharmacology":
      return article?.pharmacology ?? {};
    case "harm_potential":
      return article?.harm_potential ?? {};
    case "legality":
      return article?.legality ?? {};
    case "history_culture":
      return article?.history_culture ?? {};
    case "tolerance":
      return article?.tolerance ?? {};
    default:
      return {};
  }
}

export function buildFormalCitationUserMessage({
  article,
  sectionKey,
  sectionPrompt,
  targets,
  sourcePacket,
}) {
  const sectionConfig = getFormalCitationSectionConfig(sectionKey);
  const responseContract = buildFormalCitationSectionResponseContract(sectionConfig.key);

  return [
    sectionPrompt.trim(),
    "",
    `Section key: ${sectionConfig.key}`,
    `Article slug: ${article.slug}`,
    `Article title: ${article.title}`,
    "",
    "Return one claim decision for every target below.",
    "Follow the exact JSON contract below. Unknown keys, omitted targets, unverifiable quotes, and out-of-scope source/reference IDs will fail closed before merge.",
    "",
    "SECTION_RESPONSE_CONTRACT",
    "```json",
    JSON.stringify(responseContract, null, 2),
    "```",
    "",
    "SECTION_ARTICLE_SNAPSHOT",
    "```json",
    JSON.stringify(getSectionArticleSnapshot(article, sectionKey), null, 2),
    "```",
    "",
    "TARGETS",
    "```json",
    JSON.stringify(targets, null, 2),
    "```",
    "",
    "ALLOWED_REFERENCES",
    "```json",
    JSON.stringify(summarizeAllowedReferences(sourcePacket.allowedReferences ?? []), null, 2),
    "```",
    "",
    "QUOTE_DOCUMENT",
    "```text",
    sourcePacket.quoteDocument || "[none]",
    "```",
    "",
    "QUOTE_CORPUS",
    "```json",
    JSON.stringify(sourcePacket.quoteCorpus ?? [], null, 2),
    "```",
    "",
    "COMPILED_SOURCE_PACKET",
    "```json",
    JSON.stringify(sourcePacket.compiledSources, null, 2),
    "```",
    "",
    "WIKIPEDIA_REFERENCE_CANDIDATES",
    "```json",
    JSON.stringify(sourcePacket.wikipediaReferences ?? [], null, 2),
    "```",
    "",
    "WIKIPEDIA_CITATION_PACKET",
    "```json",
    JSON.stringify(sourcePacket.wikipediaCitationPacket ?? {
      enabled: false,
      status: "unavailable",
      excerpts: [],
      references: [],
    }, null, 2),
    "```",
  ].join("\n");
}

export function extractJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    throw new Error("Model response was empty");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to fenced/block extraction.
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Model response did not contain parseable JSON");
}

async function loadSectionQuoteDocument(sourceClient, { slug, sectionKey }) { return loadFormalCitationQuoteDocument(sourceClient, { slug, sectionKey }); }

export async function runFormalCitationSectionAgent({
  apiKey,
  sourceClient,
  article,
  articleSources,
  sectionKey,
  model,
  reasoningEffort,
  disableReasoning = false,
  wikipediaEnrichment = true,
  prompts,
  callChat = callOpenRouterChat,
}) {
  const targets = buildFormalCitationTargets({ article, sectionKey });
  const sectionPromptKey = formalCitationSectionKeyToPromptKey(sectionKey);
  const quoteDocument = await loadSectionQuoteDocument(sourceClient, {
    slug: article.slug,
    sectionKey,
  });
  const sourcePacket = await buildFormalCitationSourcePacket({
    article,
    articleSources,
    quoteDocument,
    sectionKey,
    wikipediaEnrichment,
  });
  const userMessage = buildFormalCitationUserMessage({
    article,
    sectionKey,
    sectionPrompt: prompts[sectionPromptKey],
    targets,
    sourcePacket,
  });

  const response = await callChat({
    apiKey,
    appTitle: "DoseWiki Formal Citations",
    model,
    systemPrompt: prompts.formal_citations_agent,
    userMessage,
    reasoningEffort,
    disableReasoning,
    temperature: 0.1,
    maxTokens: 12000,
  });

  let payload;
  try {
    payload = extractJsonObject(response.content);
  } catch (error) {
    if (error instanceof Error) {
      error.rawContent = response.content;
      error.sectionKey = sectionKey;
    }
    throw error;
  }

  const parsed = parseFormalCitationSectionResponse({
    payload,
    rawContent: response.content,
    sectionKey,
    targets,
    article,
    articleSources,
    sourcePacket,
  });

  return {
    schemaVersion: parsed.schemaVersion,
    sectionKey: parsed.sectionKey,
    targets,
    quoteDocument,
    sourcePacket,
    userMessage,
    rawContent: response.content,
    finishReason: response.finishReason,
    reasoning: response.reasoning,
    usage: response.usage,
    summary: parsed.summary,
    notes: parsed.notes,
    claims: parsed.claims,
    diagnostics: parsed.diagnostics,
    validationSummary: parsed.validationSummary,
  };
}
