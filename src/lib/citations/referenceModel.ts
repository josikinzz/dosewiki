import type { Reference } from "@/schema/substance/shared";
import {
  dedupeReferences as dedupeSharedReferences,
  deterministicReferenceId as deterministicSharedReferenceId,
  normalizeDoi,
  referenceDedupeKey as sharedReferenceDedupeKey,
} from "../../../lib/citations/referenceIdentity.mjs";
import {
  collectCitationIdsFromPublicRenderOrder as collectPlacementRenderOrderCitationIds,
} from "../../../lib/citations/citationPlacement.mjs";

export const CITE_TOKEN_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

export type CitationToken = {
  id: string;
  index: number;
  raw: string;
};

export type NumberedReference = Reference & {
  number: number;
  anchorId: string;
  apaTextResolved: string;
  referenceTextResolved: string;
};

export type CitationNumbering = {
  orderedIds: string[];
  numbersById: Map<string, number>;
  unknownIds: string[];
  referencesById: Map<string, Reference>;
  numberedReferences: NumberedReference[];
};

export function extractCitationTokens(text: unknown): CitationToken[] {
  if (typeof text !== "string" || !text.includes("[cite:")) return [];
  return Array.from(text.matchAll(CITE_TOKEN_PATTERN), (match) => ({
    id: match[1],
    index: match.index ?? 0,
    raw: match[0],
  }));
}

export function stripCitationTokens(text: string): string {
  return text.replace(CITE_TOKEN_PATTERN, "").replace(/\s+/g, " ").trim();
}

function collectStrings(value: unknown, seen: WeakSet<object>, strings: string[]) {
  if (typeof value === "string") {
    strings.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, seen, strings);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "references" || key === "citations" || key === "source_citations" || key === "editorial_review") {
      continue;
    }
    collectStrings(child, seen, strings);
  }
}

export function collectCitationIdsFromContent(content: unknown): string[] {
  const strings: string[] = [];
  collectStrings(content, new WeakSet(), strings);

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const text of strings) {
    for (const token of extractCitationTokens(text)) {
      if (!seen.has(token.id)) {
        seen.add(token.id);
        ids.push(token.id);
      }
    }
  }
  return ids;
}

export function collectCitationIdsFromPublicRenderOrder(article: unknown): string[] {
  return collectPlacementRenderOrderCitationIds(article);
}

export function deterministicReferenceId(input: Pick<Reference, "doi" | "pmid" | "isbn" | "url" | "siteName" | "title">): string {
  return deterministicSharedReferenceId(input);
}

export function referenceDedupeKey(reference: Reference): string {
  return sharedReferenceDedupeKey(reference);
}

export function dedupeReferences(references: Reference[]): Reference[] {
  return dedupeSharedReferences(references);
}

function joinAuthors(authors: string[]) {
  const cleaned = authors.map((author) => author.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length <= 20) {
    return `${cleaned.slice(0, -1).join(", ")}, & ${cleaned[cleaned.length - 1]}`;
  }
  return `${cleaned.slice(0, 19).join(", ")}, ... ${cleaned[cleaned.length - 1]}`;
}

export function formatApaReference(reference: Reference): string {
  if (reference.apaText?.trim()) return reference.apaText.trim();

  const authors = joinAuthors(reference.authors ?? []);
  const date = reference.date?.trim() || (reference.year ? String(reference.year) : "n.d.");
  const title = reference.title.trim() || "Untitled reference";
  const container = reference.containerTitle?.trim() || reference.siteName?.trim() || "";
  const publisher = reference.publisher?.trim() || "";
  const volumeIssue = [reference.volume, reference.issue ? `(${reference.issue})` : ""].filter(Boolean).join("");
  const pages = reference.articleNumber ? `Article ${reference.articleNumber}` : reference.pages;
  const sourceParts = [container, volumeIssue, pages].filter((part) => typeof part === "string" && part.trim());
  if (sourceParts.length === 0 && publisher) {
    sourceParts.push(publisher);
  }
  const doi = normalizeDoi(reference.doi) || normalizeDoi(reference.url);
  const locator = doi
    ? `https://doi.org/${doi}`
    : reference.url?.trim() ?? "";

  if (!authors) {
    return [
      `${title}.`,
      sourceParts.length > 0 ? `${sourceParts.join(", ")} (${date}).` : `(${date}).`,
      locator,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  return [
    `${authors}.`,
    `(${date}).`,
    `${title}.`,
    sourceParts.length > 0 ? `${sourceParts.join(", ")}.` : "",
    locator,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function joinWikipediaAuthors(authors: string[]) {
  return authors.map((author) => author.trim()).filter(Boolean).join("; ");
}

function quotedTitle(title: string) {
  const cleaned = title.trim() || "Untitled reference";
  return `"${cleaned}"`;
}

function referenceDate(reference: Reference) {
  const date = reference.date?.trim() || (reference.year ? String(reference.year).trim() : "");
  return date ? `(${date})` : "";
}

function appendSentence(parts: string[], value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) parts.push(text.endsWith(".") ? text : `${text}.`);
}

export function formatWikipediaStyleReference(reference: Reference): string {
  const parts: string[] = [];
  const authors = joinWikipediaAuthors(reference.authors ?? []);
  const date = referenceDate(reference);
  const title = quotedTitle(reference.title);

  const lead = [authors, date].filter(Boolean).join(" ");
  appendSentence(parts, lead ? `${lead}. ${title}` : title);

  if (reference.type === "journal_article") {
    appendSentence(parts, reference.containerTitle ?? reference.siteName);
    const volumeIssue = [
      reference.volume?.trim() ?? "",
      reference.issue?.trim() ? ` (${reference.issue.trim()})` : "",
    ].join("").trim();
    const pages = reference.pages?.trim() || (reference.articleNumber ? `Article ${reference.articleNumber}` : "");
    appendSentence(parts, [volumeIssue, pages ? `: ${pages}` : ""].join("").trim());
  } else if (reference.type === "book" || reference.type === "book_chapter") {
    appendSentence(parts, reference.chapter ? `Chapter: ${reference.chapter}` : "");
    appendSentence(parts, reference.edition ? `${reference.edition} ed.` : "");
    appendSentence(parts, reference.publisher);
    appendSentence(parts, reference.location);
  } else if (reference.type === "report") {
    appendSentence(parts, reference.publisher ?? reference.institution ?? reference.siteName);
  } else {
    appendSentence(parts, reference.siteName ?? reference.publisher);
  }

  const doi = normalizeDoi(reference.doi) || normalizeDoi(reference.url);
  if (doi) {
    appendSentence(parts, `doi:${doi}`);
  } else if (reference.pmid?.trim()) {
    appendSentence(parts, `PMID ${reference.pmid.trim()}`);
  } else if (reference.isbn?.trim()) {
    appendSentence(parts, `ISBN ${reference.isbn.trim()}`);
  }

  if (reference.archiveUrl?.trim()) {
    appendSentence(parts, `Archived from the original on ${reference.archiveDate?.trim() || "unknown date"}`);
  }
  if (reference.accessedAt?.trim()) {
    appendSentence(parts, `Retrieved ${reference.accessedAt.trim()}`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function buildCitationNumbering(references: Reference[], content: unknown): CitationNumbering {
  const deduped = dedupeReferences(references);
  const referencesById = new Map(deduped.map((reference) => [reference.id, reference]));
  const orderedIds = collectCitationIdsFromPublicRenderOrder(content);
  const citationIds = orderedIds.length > 0 ? orderedIds : collectCitationIdsFromContent(content);
  const unknownIds = citationIds.filter((id) => !referencesById.has(id));
  const numbersById = new Map<string, number>();
  const numberedReferences: NumberedReference[] = [];

  for (const id of citationIds) {
    const reference = referencesById.get(id);
    if (!reference || numbersById.has(id)) continue;
    const number = numberedReferences.length + 1;
    numbersById.set(id, number);
    numberedReferences.push({
      ...reference,
      number,
      anchorId: `ref-${id}`,
      apaTextResolved: formatApaReference(reference),
      referenceTextResolved: formatWikipediaStyleReference(reference),
    });
  }

  return { orderedIds: citationIds, numbersById, unknownIds, referencesById, numberedReferences };
}

export function renderCitationTokenText(text: string, numbering: Pick<CitationNumbering, "numbersById">): string {
  return text.replace(CITE_TOKEN_PATTERN, (_token, id: string) => {
    const number = numbering.numbersById.get(id);
    return number ? `[${number}]` : "[?]";
  });
}
