import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { api } from "../../lib/postgres/runtime/api.ts"
import { getQuoteSectionById } from "../../lib/quoteSections.mjs";
import { normalizeIdentifier } from "../../lib/citations/referenceIdentity.mjs";
import { getFormalCitationSectionConfig } from "./formal-citations-section-config.mjs";
import { canonicalizeSourceId, clipText } from "./formal-citations-source-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

function loadLocalQuoteDocument(slug, descriptor) {
  if (!descriptor?.outputDir || !descriptor?.outputSuffix) return "";
  const filePath = join(PROJECT_ROOT, descriptor.outputDir, `${slug}${descriptor.outputSuffix}`);
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8");
}

export async function loadFormalCitationQuoteDocument(sourceClient, { slug, sectionKey }) {
  const sectionConfig = getFormalCitationSectionConfig(sectionKey);
  const quoteDescriptor = getQuoteSectionById(sectionConfig.quoteSectionId);
  if (!quoteDescriptor) return "";

  if (quoteDescriptor.storageMode === "local-file") {
    return loadLocalQuoteDocument(slug, quoteDescriptor);
  }

  try {
    const quote = await sourceClient.query(api.quotes.getBySlugAndSection, {
      slug,
      section: sectionConfig.quoteSectionId,
    });
    return quote?.content ?? "";
  } catch {
    return "";
  }
}

export function extractQuoteCorpusEntries(quoteDocument) {
  const text = String(quoteDocument ?? "");
  if (!text.trim()) return [];

  const matches = Array.from(text.matchAll(/^##\s+Source:\s+(.+)$/gm));
  if (matches.length === 0) return [];

  const entries = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const sourceName = current[1].trim();
    const start = current.index + current[0].length;
    const end = next ? next.index : text.length;
    const content = text
      .slice(start, end)
      .replace(/^\s*---\s*/g, "")
      .trim();

    if (!content) continue;

    entries.push({
      sourceName,
      sourceId: canonicalizeSourceId(sourceName) ?? normalizeIdentifier(sourceName),
      content,
      excerpt: clipText(content, 1400),
      provenance: {
        kind: "quote_corpus",
        sourceName,
      },
    });
  }
  return entries;
}
