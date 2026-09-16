import { sectionKeyToPromptKey } from "../../lib/prompt-registry.mjs";
import { CONFIG } from "../pharmacology/cli.mjs";
import { createOpenRouterCaller } from "../pharmacology/openrouter.mjs";
import { buildUserMessage, parseGeneratedYaml } from "../pharmacology/parser.mjs";
import { sha256Text } from "./core.mjs";

const PHARMACOLOGY_ADAPTER_VERSION = "pharmacology-proposal-adapter-v1"

function sourceArticleContext(article) {
  return {
    title: article.title,
    classification: {
      psychoactive_class: article.classification?.psychoactive_class ?? [],
      chemical_class: article.classification?.chemical_class ?? [],
    },
  };
}

export async function loadPharmacologyProposalInputs({
  sourceClient,
  api,
  slug,
  sourceArticle,
}) {
  const promptKey = sectionKeyToPromptKey("pharmacology");
  const [promptRecord, quoteRecord] = await Promise.all([
    sourceClient.query(api.prompts.getByKey, { key: promptKey }),
    sourceClient.query(api.quotes.getBySlugAndSection, {
      slug,
      section: "pharmacology",
    }),
  ]);

  if (!promptRecord || typeof promptRecord.content !== "string" || !promptRecord.content.trim()) {
    throw new Error(`${promptKey} prompt not found in source Postgres deployment.`);
  }
  if (promptRecord.key !== promptKey) {
    throw new Error(`Pharmacology prompt identity mismatch: expected ${promptKey}, received ${promptRecord.key ?? "missing"}.`);
  }
  if (!quoteRecord) {
    throw new Error("Pharmacology quote doc not found in source Postgres deployment.");
  }
  if (quoteRecord.slug !== slug || quoteRecord.section !== "pharmacology") {
    throw new Error("Pharmacology quote doc identity does not match the requested slug and section.");
  }
  if (typeof quoteRecord.content !== "string" || !quoteRecord.content.trim()) {
    throw new Error("Pharmacology quote doc exists but has no content.");
  }

  return {
    promptKey,
    promptRecord,
    systemMessage: promptRecord.content,
    userMessage: buildUserMessage(sourceArticle, quoteRecord.content),
    sourceArticleContext: sourceArticleContext(sourceArticle),
    sourceMaterial: {
      kind: "quotes",
      record: quoteRecord,
      excerpts: [{
        sourceId: "pharmacology-quote",
        includedContent: quoteRecord.content,
        includedContentHash: sha256Text(quoteRecord.content),
        truncated: false,
      }],
    },
  };
}

function parsePharmacologyProposalValue(rawResponse) {
  // Proposal parsing must not emit the legacy mutable tmp/debug artifacts.
  return parseGeneratedYaml(rawResponse, null);
}

export const pharmacologyProposalAdapter = Object.freeze({
  section: "pharmacology",
  publicationProfile: "pharmacology",
  // The publication CAS owns these fields, but proposal generation may change only pharmacology.
  publicationFields: ["pharmacology", "dosage", "duration"],
  adapterVersion: PHARMACOLOGY_ADAPTER_VERSION,
  config: CONFIG,
  loadInputs: loadPharmacologyProposalInputs,
  parseGeneratedValue: parsePharmacologyProposalValue,
  createOpenRouterCaller,
});
