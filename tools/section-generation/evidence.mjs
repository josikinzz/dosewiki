import YAML from "yaml";
import { substanceArticleSchema } from "../../src/schema/substance/article.ts";
import { validateArticleSourceDocument } from "../../scripts/article-source-documents/contract.mjs";
import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
} from "../../scripts/analyze/public-prose-artifact-language-core.mjs";
import { GENERATION_SECTIONS } from "../../lib/sectionGeneration/contract.mjs";

const NO_CONTENT = /^(?:no (?:relevant |available |specific |reliable |direct )?(?:(?:intro(?:duction)?|summary|pharmacology|tolerance|harm[ -]potential|history(?:[ -]and[ -]culture)?|[a-z-]+-related) )?(?:content|information|quotes|excerpts|data|evidence)(?: (?:was |were )?(?:found|available|provided|identified)(?: (?:in|for|from) .*)?)?[.!]?|the available source articles do not contain.*|none)$/i;
export function substantiveExcerpt(content) {
  if (typeof content !== "string") return "";
  return content.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => !/^#{1,6}(?:\s|$)/.test(line))
    .map((line) => line.replace(/^>\s?/, "").replace(/^\*+|\*+$/g, "").trim())
    .filter((line) => line && !/^[-*_=`\s]+$/.test(line) &&
      !/^(?:source|note|generated|verbatim extractions)\s*[:\s]/i.test(line) &&
      !NO_CONTENT.test(line) && !/^https?:\/\/\S+$/.test(line))
    .join("\n").trim();
}
export function isSourcePoorMarker(content) {
  return typeof content === "string" && !substantiveExcerpt(content) && content.split(/\r?\n/)
    .some((line) => NO_CONTENT.test(line.trim().replace(/^[>*\s]+|[*\s]+$/g, "")));
}

export function sourceBlocks(document) {
  if (!document) return [];
  validateArticleSourceDocument(document);
  const blocks = [];
  for (const source of document.sources) {
    if (typeof document.contents[source.id] !== "string") throw new Error("Source text must be a string");
    const text = document.contents[source.id];
    // Paragraph blocks include their original delimiters. Selection never rewrites source bytes.
    for (const match of text.matchAll(/[^\r\n](?:[^\r\n]|\r?\n(?!\r?\n))*(?:\r?\n\r?\n|$)/g)) {
      blocks.push({ id: `B${String(blocks.length + 1).padStart(6, "0")}`, sourceId: source.id,
        sourceName: source.displayName ?? source.id, start: match.index, text: match[0] });
    }
  }
  return blocks;
}
export function selectExactBlocks(rawText, blocks, document) {
  const value = JSON.parse(rawText);
  if (!value || Array.isArray(value) || Object.keys(value).join() !== "selectedBlockIds" ||
      !Array.isArray(value.selectedBlockIds)) throw new Error("Extraction requires exactly {selectedBlockIds: string[]}");
  const seen = new Set();
  const selected = [];
  let previous = -1;
  for (const id of value.selectedBlockIds) {
    const index = blocks.findIndex((block) => block.id === id);
    if (typeof id !== "string" || index < 0 || seen.has(id) || index <= previous) {
      throw new Error("Selected block IDs must be known, unique, and in source order");
    }
    const block = blocks[index];
    if (!document.sources.some((source) => source.id === block.sourceId) ||
      document.contents[block.sourceId].slice(block.start, block.start + block.text.length) !== block.text) {
      throw new Error("Selected block source membership mismatch");
    }
    seen.add(id); previous = index; selected.push(block);
  }
  return { selectedBlockIds: [...seen], excerpts: selected.map((block) => ({
    sourceId: block.sourceId, blockId: block.id, text: block.text,
  })), exactContent: selected.map((block) => `## Source: ${block.sourceName}\n\n${block.text}`).join("\n") };
}

function assertNoDroppedKeys(input, parsed, path = "") {
  if (input && typeof input === "object") {
    for (const key of Object.keys(input)) {
      if (!parsed || !Object.hasOwn(parsed, key)) throw new Error(`Unknown schema key: ${path}/${key}`);
      assertNoDroppedKeys(input[key], parsed[key], `${path}/${key}`);
    }
  }
}
export function parseWriterOutput(rawText, section) {
  if (!GENERATION_SECTIONS.includes(section)) throw new Error("Unowned section");
  if (typeof rawText !== "string" || /\[cite:/i.test(rawText)) throw new Error("Generated citation markers are forbidden");
  const documents = YAML.parseAllDocuments(rawText, { uniqueKeys: true, strict: true, version: "1.2" });
  if (documents.length !== 1 || documents[0].errors.length || documents[0].warnings.length) {
    throw new Error("Output must be one strict YAML document without warnings");
  }
  const value = documents[0].toJS({ maxAliasCount: 0 });
  if (!value || Array.isArray(value) || typeof value !== "object" ||
      Object.keys(value).length !== 1 || !Object.hasOwn(value, section)) {
    throw new Error(`Output must contain exactly the ${section} top-level key`);
  }
  const parsed = substanceArticleSchema.shape[section].parse(value[section]);
  assertNoDroppedKeys(value[section], parsed, section);
  const article = { slug: "generation", [section]: parsed };
  assertNoPublicProseArtifactLanguage(article, { sections: [section] });
  assertNoPublicProseNamedSourceAttribution(article, { sections: [section] });
  return parsed;
}
export function hasGeneratedContent(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasGeneratedContent);
  return value && typeof value === "object" ? Object.values(value).some(hasGeneratedContent) : false;
}
