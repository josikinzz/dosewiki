import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { api } from "../../convex/_generated/api.js";
import { getQuoteSectionById } from "../../lib/quoteSections.js";
import {
  classifyQuality,
  classifySourceType,
  collectFormalCitationReferences,
} from "./formal-citations-reference-catalog.mjs";
import {
  getFormalCitationSectionConfig,
} from "./formal-citations-section-config.mjs";
import {
  deterministicReferenceId,
  normalizeIdentifier,
} from "../../lib/citations/referenceIdentity.js";
import { transformDoseRanges } from "../prepopulate/dosage-duration/dosage.mjs";
import { transformStages } from "../prepopulate/dosage-duration/duration.mjs";
import { normalizeRoute, normalizeUnit } from "../prepopulate/dosage-duration/normalize.mjs";
import {
  buildWikipediaCitationExcerpts,
  buildWikipediaCitationPacket,
  extractWikipediaReferenceCandidates,
  loadWikipediaSourceForArticle,
} from "./wikipedia-source-enrichment.mjs";

export { extractWikipediaReferenceCandidates } from "./wikipedia-source-enrichment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const PARSED_SOURCES_PATH = join(PROJECT_ROOT, "src/data/parsed-sources.json");

const MAX_QUOTES_CHARS = 12000;
const MAX_SOURCE_EXCERPT_CHARS = 2600;
const MAX_SOURCE_COUNT = 6;

const SOURCE_ID_ALIASES = new Map([
  ["erowid", "erowid"],
  ["psychonautwiki", "psychonautwiki"],
  ["psychonaut wiki", "psychonautwiki"],
  ["tripsit factsheets", "tripsit-factsheets"],
  ["tripsit factsheet", "tripsit-factsheets"],
  ["tripsit wiki", "tripsit-wiki"],
  ["wikipedia", "wikipedia"],
  ["drug users bible", "drugusersbible"],
  ["drug user's bible", "drugusersbible"],
  ["the drug classroom", "thedrugclassroom"],
  ["disregard everything i say", "disregardeverythingisay"],
  ["isomer design", "isomerdesign"],
  ["saferparty", "saferparty"],
]);

let cachedParsedSources = null;

function clipText(value, maxChars) {
  if (typeof value !== "string") return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function normalizeTextNeedle(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSourceLookupKey(value) {
  return normalizeTextNeedle(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalizeSourceId(value) {
  const normalized = normalizeSourceLookupKey(value);
  if (!normalized) return null;
  if (SOURCE_ID_ALIASES.has(normalized)) {
    return SOURCE_ID_ALIASES.get(normalized);
  }

  const compact = normalized.replace(/\s+/g, "");
  if (SOURCE_ID_ALIASES.has(compact)) {
    return SOURCE_ID_ALIASES.get(compact);
  }

  return compact || null;
}

function summarizeReferenceForPrompt(reference) {
  return {
    id: reference.id ?? null,
    title: reference.title ?? reference.name ?? null,
    siteName: reference.siteName ?? reference.name ?? null,
    url: reference.url ?? null,
    doi: reference.doi ?? null,
    pmid: reference.pmid ?? null,
    isbn: reference.isbn ?? null,
    sourceIds: Array.isArray(reference.sourceIds) ? reference.sourceIds : [],
    provenance: Array.isArray(reference.provenance)
      ? reference.provenance.map((entry) => ({
          kind: entry.kind ?? "unknown",
          sourceId: entry.sourceId ?? null,
          refName: entry.refName ?? null,
        }))
      : [],
  };
}

function selectYear(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values ?? []) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeAuthors(authors) {
  if (!Array.isArray(authors)) return [];
  return dedupeStrings(authors.map((author) => {
    if (typeof author === "string") return author;
    const given = String(author?.given ?? "").trim();
    const family = String(author?.family ?? "").trim();
    return [given, family].filter(Boolean).join(" ").trim();
  }));
}

function buildNormalizedReference(reference, overrides = {}) {
  const merged = {
    ...reference,
    ...overrides,
  };
  const normalized = {
    id: merged.id ?? "",
    type: merged.type ?? "webpage",
    title: merged.title ?? merged.name ?? merged.url ?? "Untitled reference",
    authors: normalizeAuthors(merged.authors),
    siteName: merged.siteName ?? merged.name ?? null,
    url: merged.url ?? null,
    doi: merged.doi ?? null,
    pmid: merged.pmid ?? null,
    isbn: merged.isbn ?? null,
    year: merged.year ?? null,
    publisher: merged.publisher ?? null,
    sourceType: merged.sourceType ?? classifySourceType(merged.title, merged.url),
    quality: merged.quality ?? classifyQuality(merged.title, merged.url),
    sourceIds: dedupeStrings(merged.sourceIds),
    provenance: Array.isArray(merged.provenance) ? merged.provenance : [],
  };

  normalized.id = normalized.id || deterministicReferenceId(normalized);
  return normalized;
}

function extractIdentifiersFromText(value) {
  const text = String(value ?? "");
  const doiMatch = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i);
  const pmidMatch = text.match(/\bPMID\s*:?\s*(\d{5,10})\b/i) ?? text.match(/\bpubmed(?:\s+id)?\s*:?\s*(\d{5,10})\b/i);
  const isbnMatch = text.match(/\b(?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dX]\b/i);
  const urlMatch = text.match(/\bhttps?:\/\/[^\s)<>"']+/i);

  return {
    doi: doiMatch ? doiMatch[0].replace(/[.,;]+$/g, "") : null,
    pmid: pmidMatch ? pmidMatch[1] : null,
    isbn: isbnMatch ? isbnMatch[0].replace(/[-\s]/g, "") : null,
    url: urlMatch ? urlMatch[0].replace(/[.,;}\]]+$/g, "") : null,
  };
}

function normalizeReferenceCandidate(candidate) {
  const fromStrings = extractIdentifiersFromText(
    [
      candidate?.title,
      candidate?.siteName,
      candidate?.name,
      candidate?.url,
      candidate?.rawCitation,
    ].filter(Boolean).join(" "),
  );
  const url = String(candidate?.url ?? fromStrings.url ?? "").trim() || null;
  const doi = String(candidate?.doi ?? fromStrings.doi ?? "").trim() || null;
  const pmid = String(candidate?.pmid ?? fromStrings.pmid ?? "").trim() || null;
  const isbn = String(candidate?.isbn ?? fromStrings.isbn ?? "").trim() || null;

  return {
    ...candidate,
    id: candidate?.id ?? null,
    type: candidate?.type ?? null,
    title: String(candidate?.title ?? candidate?.name ?? "").trim() || null,
    siteName: String(candidate?.siteName ?? candidate?.publisher ?? "").trim() || null,
    url,
    doi,
    pmid,
    isbn,
    authors: normalizeAuthors(candidate?.authors),
    sourceIds: dedupeStrings(candidate?.sourceIds),
    provenance: Array.isArray(candidate?.provenance) ? candidate.provenance : [],
    year: candidate?.year ?? null,
    publisher: candidate?.publisher ?? null,
  };
}

function candidateToReference(candidate, overrides = {}) {
  return buildNormalizedReference({
    id: candidate?.id ?? null,
    type: candidate?.isbn ? "book" : "webpage",
    title: candidate?.title ?? candidate?.siteName ?? candidate?.url ?? "Untitled reference",
    authors: candidate?.authors ?? [],
    siteName: candidate?.siteName ?? null,
    url: candidate?.url ?? null,
    doi: candidate?.doi ?? null,
    pmid: candidate?.pmid ?? null,
    isbn: candidate?.isbn ?? null,
    year: candidate?.year ?? null,
    publisher: candidate?.publisher ?? null,
    sourceType: classifySourceType(candidate?.title, candidate?.url),
    quality: classifyQuality(candidate?.title, candidate?.url),
    sourceIds: candidate?.sourceIds ?? [],
    provenance: candidate?.provenance ?? [],
    ...overrides,
  });
}

function loadParsedSources() {
  if (!cachedParsedSources) {
    cachedParsedSources = JSON.parse(readFileSync(PARSED_SOURCES_PATH, "utf8"));
  }
  return cachedParsedSources;
}

function locateBestSourceExcerpt(content, searchTerms) {
  const normalized = String(content ?? "").toLowerCase();
  const index = searchTerms.reduce((best, term) => {
    const candidate = normalized.indexOf(term);
    if (candidate === -1) return best;
    if (best === -1) return candidate;
    return Math.min(best, candidate);
  }, -1);
  const start = index >= 0 ? Math.max(0, index - 240) : 0;
  return clipText(String(content ?? "").slice(start, start + MAX_SOURCE_EXCERPT_CHARS), MAX_SOURCE_EXCERPT_CHARS);
}

function extractQuoteCorpusEntries(quoteDocument) {
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

function scoreSourceForSection({ source, content, sectionConfig, quoteEntries }) {
  const normalizedContent = String(content ?? "").toLowerCase();
  const matchedNeedles = [];
  let score = 0;

  for (const needle of sectionConfig.sourceNeedles) {
    const normalizedNeedle = needle.toLowerCase();
    const hits = normalizedContent.split(normalizedNeedle).length - 1;
    if (hits > 0) {
      matchedNeedles.push(needle);
      score += Math.min(hits, 3) * 3;
    }
  }

  const sourceCanonicalId = canonicalizeSourceId(source.id) ?? normalizeIdentifier(source.id);
  const displayCanonicalId = canonicalizeSourceId(source.displayName) ?? normalizeIdentifier(source.displayName);
  const quoteEntry = quoteEntries.find((entry) => {
    const candidateIds = [
      entry.sourceId,
      canonicalizeSourceId(entry.sourceName),
      normalizeIdentifier(entry.sourceName),
    ].filter(Boolean);
    return candidateIds.includes(sourceCanonicalId) || candidateIds.includes(displayCanonicalId);
  });

  if (quoteEntry) {
    score += 8;
  }
  if (sourceCanonicalId === "wikipedia") {
    score += 2;
  }

  return {
    score,
    matchedNeedles: dedupeStrings(matchedNeedles),
    quoteEntry,
  };
}

function resolveCompiledSourcesForSection({ articleSources, sectionKey, quoteEntries, matcherSourceIds = [] }) {
  const sectionConfig = getFormalCitationSectionConfig(sectionKey);
  const contents = articleSources?.contents ?? {};
  const sources = Array.isArray(articleSources?.sources) ? articleSources.sources : [];
  const preferredSourceIds = new Set(matcherSourceIds);

  const scoredSources = sources
    .map((source) => {
      const content = contents[source.id];
      if (typeof content !== "string" || !content.trim()) return null;

      const scoring = scoreSourceForSection({
        source,
        content,
        sectionConfig,
        quoteEntries,
      });
      const canonicalId = canonicalizeSourceId(source.id) ?? normalizeIdentifier(source.id);
      const preferred = preferredSourceIds.has(source.id) || preferredSourceIds.has(canonicalId);

      if (!preferred && scoring.score <= 0) {
        return null;
      }

      return {
        id: source.id,
        displayName: source.displayName || source.id,
        fileName: source.fileName,
        excerpt: locateBestSourceExcerpt(
          content,
          [
            ...sectionConfig.sourceNeedles,
            source.displayName,
            ...(scoring.quoteEntry ? [scoring.quoteEntry.sourceName] : []),
          ].filter(Boolean).map((term) => term.toLowerCase()),
        ),
        matchedNeedles: scoring.matchedNeedles,
        sectionScore: scoring.score + (preferred ? 20 : 0),
        provenance: scoring.quoteEntry
          ? [scoring.quoteEntry.provenance]
          : [],
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.sectionScore - left.sectionScore)
    .slice(0, MAX_SOURCE_COUNT);

  return scoredSources;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "DoseWiki Formal Citations/1.0",
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function enrichViaCrossref(candidate, fetchImpl) {
  const doi = candidate.doi;
  if (!doi) return null;

  const response = await fetchJson(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    fetchImpl,
  );
  const message = response?.message;
  if (!message) return null;

  return candidateToReference(candidate, {
    type: message.type === "book" || message.type === "monograph" ? "book" : "webpage",
    title: Array.isArray(message.title) ? message.title[0] : message.title ?? candidate.title,
    authors: Array.isArray(message.author) ? message.author : candidate.authors,
    siteName: Array.isArray(message["container-title"])
      ? message["container-title"][0] ?? candidate.siteName
      : candidate.siteName,
    url: message.URL ?? candidate.url ?? (doi ? `https://doi.org/${doi}` : null),
    doi,
    year: message.issued?.["date-parts"]?.[0]?.[0]
      ?? message.created?.["date-parts"]?.[0]?.[0]
      ?? candidate.year,
    publisher: message.publisher ?? candidate.publisher,
    sourceType: "primary_literature",
    quality: "high",
  });
}

async function enrichViaPubMed(candidate, fetchImpl) {
  const pmid = candidate.pmid;
  if (!pmid) return null;

  const response = await fetchJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`,
    fetchImpl,
  );
  const record = response?.result?.[pmid];
  if (!record) return null;

  return candidateToReference(candidate, {
    title: record.title ?? candidate.title,
    authors: Array.isArray(record.authors) ? record.authors.map((author) => author.name) : candidate.authors,
    siteName: record.fulljournalname ?? candidate.siteName ?? "PubMed",
    url: candidate.url ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    pmid,
    year: selectYear(record.pubdate ?? record.sortpubdate) ?? candidate.year,
    sourceType: candidate.doi ? "primary_literature" : "medical_database",
    quality: "high",
  });
}

async function enrichViaOpenLibrary(candidate, fetchImpl) {
  const isbn = candidate.isbn;
  if (!isbn) return null;

  const response = await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`,
    fetchImpl,
  );
  const record = response?.[`ISBN:${isbn}`];
  if (!record) return null;

  return candidateToReference(candidate, {
    type: "book",
    title: record.title ?? candidate.title,
    authors: Array.isArray(record.authors) ? record.authors.map((author) => author.name) : candidate.authors,
    siteName: "Open Library",
    url: candidate.url ?? record.url ?? null,
    isbn,
    year: selectYear(record.publish_date) ?? candidate.year,
    publisher: Array.isArray(record.publishers)
      ? record.publishers.map((publisher) => publisher.name).filter(Boolean).join("; ")
      : candidate.publisher,
    sourceType: "book",
    quality: "medium",
  });
}

export async function enrichKnownReferenceCandidates(candidates, { fetchImpl = globalThis.fetch } = {}) {
  const normalizedCandidates = candidates.map(normalizeReferenceCandidate);
  const enriched = [];

  for (const candidate of normalizedCandidates) {
    let reference = null;

    if (typeof fetchImpl === "function") {
      try {
        if (candidate.doi) {
          reference = await enrichViaCrossref(candidate, fetchImpl);
        } else if (candidate.pmid) {
          reference = await enrichViaPubMed(candidate, fetchImpl);
        } else if (candidate.isbn) {
          reference = await enrichViaOpenLibrary(candidate, fetchImpl);
        }
      } catch {
        reference = null;
      }
    }

    enriched.push(reference ?? candidateToReference(candidate));
  }

  return enriched;
}

function dedupeAllowedReferences(references) {
  const byId = new Map();

  for (const reference of references) {
    const current = buildNormalizedReference(reference);
    const existing = byId.get(current.id);
    if (!existing) {
      byId.set(current.id, current);
      continue;
    }

    byId.set(current.id, buildNormalizedReference(existing, {
      title: existing.title || current.title,
      authors: dedupeStrings([...(existing.authors ?? []), ...(current.authors ?? [])]),
      siteName: existing.siteName || current.siteName,
      url: existing.url || current.url,
      doi: existing.doi || current.doi,
      pmid: existing.pmid || current.pmid,
      isbn: existing.isbn || current.isbn,
      year: existing.year || current.year,
      publisher: existing.publisher || current.publisher,
      sourceType: existing.sourceType !== "unknown" ? existing.sourceType : current.sourceType,
      quality: existing.quality !== "fallback" ? existing.quality : current.quality,
      sourceIds: dedupeStrings([...(existing.sourceIds ?? []), ...(current.sourceIds ?? [])]),
      provenance: [...(existing.provenance ?? []), ...(current.provenance ?? [])],
    }));
  }

  return Array.from(byId.values());
}

function referenceMatchesSectionSources(reference, sectionSources) {
  const haystack = normalizeTextNeedle(
    `${reference?.title ?? ""} ${reference?.siteName ?? ""} ${reference?.url ?? ""}`,
  );
  if (!haystack) return false;

  return sectionSources.some((source) => {
    const sourceId = normalizeTextNeedle(source.id);
    const displayName = normalizeTextNeedle(source.displayName);
    return (sourceId && haystack.includes(sourceId)) || (displayName && haystack.includes(displayName));
  });
}

function selectExistingReferenceCandidates(article, sectionSources) {
  return collectFormalCitationReferences(article)
    .filter((reference) => referenceMatchesSectionSources(reference, sectionSources))
    .map((reference) => buildNormalizedReference(reference, {
      sourceIds: sectionSources
        .filter((source) => referenceMatchesSectionSources(reference, [source]))
        .map((source) => source.id),
      provenance: [{
        kind: "article_reference",
        sourceId: null,
        refName: null,
      }],
    }));
}

function normalizeDosageTierMap(route) {
  const doseRanges = route?.dose_ranges ?? {};
  return {
    threshold: normalizeDoseTier(doseRanges.threshold),
    light: normalizeDoseTier(doseRanges.light),
    moderate: normalizeDoseTier(doseRanges.moderate ?? doseRanges.common),
    strong: normalizeDoseTier(doseRanges.strong),
    heavy: normalizeDoseTier(doseRanges.heavy),
  };
}

function normalizeDoseTier(tier) {
  if (!tier) return { min: null, max: null, unit: "mg" };
  return {
    min: tier.min ?? null,
    max: tier.max ?? null,
    unit: normalizeUnit(tier.unit),
  };
}

function normalizeDurationStageMap(route) {
  const stages = route?.stages ?? {};
  return {
    onset: normalizeDurationStage(stages.onset),
    come_up: normalizeDurationStage(stages.come_up),
    peak: normalizeDurationStage(stages.peak),
    offset: normalizeDurationStage(stages.offset),
    after_effects: normalizeDurationStage(stages.after_effects),
    total_duration: normalizeDurationStage(stages.total_duration),
  };
}

function normalizeDurationStage(stage) {
  if (!stage) return { min: null, max: null, unit: "hours" };
  return {
    min: stage.min ?? null,
    max: stage.max ?? null,
    unit: normalizeUnit(stage.unit),
  };
}

function compareNumericField(leftValue, rightValue) {
  if (leftValue == null && rightValue == null) {
    return { kind: "both_empty", matches: true };
  }
  if (leftValue == null || rightValue == null) {
    return { kind: "missing", matches: false };
  }

  const delta = Math.abs(leftValue - rightValue);
  const tolerance = Math.max(0.25, Math.max(Math.abs(leftValue), Math.abs(rightValue)) * 0.05);
  return {
    kind: delta <= tolerance ? "exactish" : "mismatch",
    matches: delta <= tolerance,
    delta,
  };
}

function scoreDoseRouteMatch(articleRoute, candidateEntry) {
  const articleRanges = normalizeDosageTierMap(articleRoute);
  const candidateRanges = normalizeDosageTierMap({ dose_ranges: transformDoseRanges(candidateEntry.ranges) });
  const tiers = ["threshold", "light", "moderate", "strong", "heavy"];
  const compared = [];
  let matchedCells = 0;
  let comparedCells = 0;
  let unitMismatch = false;

  for (const tier of tiers) {
    for (const bound of ["min", "max"]) {
      const articleValue = articleRanges[tier]?.[bound] ?? null;
      const candidateValue = candidateRanges[tier]?.[bound] ?? null;
      const articleUnit = articleRanges[tier]?.unit ?? "mg";
      const candidateUnit = candidateRanges[tier]?.unit ?? "mg";

      if (articleValue == null && candidateValue == null) continue;
      comparedCells += 1;

      if (articleUnit !== candidateUnit) {
        unitMismatch = true;
      }

      const comparison = compareNumericField(articleValue, candidateValue);
      if (comparison.matches) {
        matchedCells += 1;
      }

      compared.push({
        field: `${tier}.${bound}`,
        articleValue,
        candidateValue,
        articleUnit,
        candidateUnit,
        comparison: comparison.kind,
      });
    }
  }

  return {
    sourceId: candidateEntry.source,
    route: normalizeRoute(candidateEntry.route),
    unitMismatch,
    comparedCells,
    matchedCells,
    score: comparedCells > 0 ? matchedCells / comparedCells : 0,
    compared,
  };
}

function scoreDurationRouteMatch(articleRoute, candidateEntry) {
  const articleStages = normalizeDurationStageMap(articleRoute);
  const candidateStages = normalizeDurationStageMap({ stages: transformStages(candidateEntry.stages) });
  const stageNames = ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"];
  const compared = [];
  let matchedCells = 0;
  let comparedCells = 0;
  let unitMismatch = false;

  for (const stage of stageNames) {
    for (const bound of ["min", "max"]) {
      const articleValue = articleStages[stage]?.[bound] ?? null;
      const candidateValue = candidateStages[stage]?.[bound] ?? null;
      const articleUnit = articleStages[stage]?.unit ?? "hours";
      const candidateUnit = candidateStages[stage]?.unit ?? "hours";

      if (articleValue == null && candidateValue == null) continue;
      comparedCells += 1;

      if (articleUnit !== candidateUnit) {
        unitMismatch = true;
      }

      const comparison = compareNumericField(articleValue, candidateValue);
      if (comparison.matches) {
        matchedCells += 1;
      }

      compared.push({
        field: `${stage}.${bound}`,
        articleValue,
        candidateValue,
        articleUnit,
        candidateUnit,
        comparison: comparison.kind,
      });
    }
  }

  return {
    sourceId: candidateEntry.source,
    route: normalizeRoute(candidateEntry.route),
    unitMismatch,
    comparedCells,
    matchedCells,
    score: comparedCells > 0 ? matchedCells / comparedCells : 0,
    compared,
  };
}

function buildDosageDurationMatcherResults({ article, parsedSubstance }) {
  if (!parsedSubstance) {
    return {
      selectedSourceIds: [],
      dosage: [],
      duration: [],
    };
  }

  const dosage = [];
  for (const route of article?.dosage?.routes ?? []) {
    const normalizedRoute = normalizeRoute(route.route);
    const candidates = (parsedSubstance.dosage ?? [])
      .filter((entry) => normalizeRoute(entry.route) === normalizedRoute)
      .map((entry) => scoreDoseRouteMatch(route, entry))
      .sort((left, right) => right.score - left.score || left.unitMismatch - right.unitMismatch);

    dosage.push({
      route: normalizedRoute,
      selectedSourceId: candidates[0]?.sourceId ?? null,
      accepted: Boolean(candidates[0] && !candidates[0].unitMismatch && candidates[0].score >= 0.7),
      candidates,
    });
  }

  const duration = [];
  for (const route of article?.duration?.routes ?? []) {
    const normalizedRoute = normalizeRoute(route.route);
    const candidates = (parsedSubstance.duration ?? [])
      .filter((entry) => normalizeRoute(entry.route) === normalizedRoute)
      .map((entry) => scoreDurationRouteMatch(route, entry))
      .sort((left, right) => right.score - left.score || left.unitMismatch - right.unitMismatch);

    duration.push({
      route: normalizedRoute,
      selectedSourceId: candidates[0]?.sourceId ?? null,
      accepted: Boolean(candidates[0] && !candidates[0].unitMismatch && candidates[0].score >= 0.7),
      candidates,
    });
  }

  return {
    selectedSourceIds: dedupeStrings([
      ...dosage.map((entry) => entry.selectedSourceId),
      ...duration.map((entry) => entry.selectedSourceId),
    ]),
    dosage,
    duration,
  };
}

export function sanitizeAllowedReferenceForArticle(reference) {
  const normalized = buildNormalizedReference(reference);
  return {
    id: normalized.id,
    type: normalized.type,
    title: normalized.title,
    authors: normalized.authors,
    siteName: normalized.siteName,
    url: normalized.url,
    doi: normalized.doi ?? undefined,
    pmid: normalized.pmid ?? undefined,
    isbn: normalized.isbn ?? undefined,
    sourceType: normalized.sourceType,
    quality: normalized.quality,
  };
}

async function loadLocalQuoteDocument(slug, descriptor) {
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

export async function buildFormalCitationSourcePacket({
  article,
  articleSources,
  quoteDocument,
  sectionKey,
  fetchImpl = globalThis.fetch,
  parsedSourceSubstance = null,
  wikipediaEnrichment = true,
}) {
  const quoteCorpus = extractQuoteCorpusEntries(quoteDocument);
  const matcherResults = normalizeIdentifier(sectionKey) === "dosage-duration" || sectionKey === "dosage_duration"
    ? buildDosageDurationMatcherResults({
        article,
        parsedSubstance: parsedSourceSubstance ?? loadParsedSources()?.substances?.[article?.slug],
      })
    : null;

  const wikipediaSource = (articleSources?.sources ?? []).find((source) => (
    canonicalizeSourceId(source.id) === "wikipedia" ||
    canonicalizeSourceId(source.displayName) === "wikipedia"
  ));
  const wikipediaLoad = wikipediaEnrichment && wikipediaSource
    ? await loadWikipediaSourceForArticle({
        article,
        articleSources,
        source: wikipediaSource,
        fetchImpl,
      })
    : {
        document: null,
        diagnostics: wikipediaEnrichment
          ? []
          : [{ kind: "wikipedia_enrichment_disabled", reason: "--wikipedia-enrichment=off" }],
      };
  const enrichedArticleSources = wikipediaLoad.document
    ? {
        ...(articleSources ?? {}),
        contents: {
          ...(articleSources?.contents ?? {}),
          [wikipediaSource?.id ?? "wikipedia"]: wikipediaLoad.document.source,
        },
      }
    : articleSources;

  const compiledSources = resolveCompiledSourcesForSection({
    articleSources: enrichedArticleSources,
    sectionKey,
    quoteEntries: quoteCorpus,
    matcherSourceIds: matcherResults?.selectedSourceIds ?? [],
  });

  const wikipediaReferences = compiledSources
    .filter((source) => canonicalizeSourceId(source.id) === "wikipedia")
    .flatMap((source) => extractWikipediaReferenceCandidates({
      sourceId: source.id,
      sourceName: source.displayName,
      content: enrichedArticleSources?.contents?.[source.id] ?? "",
    }));
  const wikipediaCitationExcerpts = wikipediaLoad.document
    ? buildWikipediaCitationExcerpts({
        source: wikipediaLoad.document.source,
        sectionKey: getFormalCitationSectionConfig(sectionKey).key,
        sectionConfig: getFormalCitationSectionConfig(sectionKey),
      })
    : [];
  const wikipediaCitationPacket = wikipediaEnrichment
    ? buildWikipediaCitationPacket({
        document: wikipediaLoad.document,
        references: wikipediaReferences,
        excerpts: wikipediaCitationExcerpts,
        excerpt: compiledSources.find((source) => canonicalizeSourceId(source.id) === "wikipedia")?.excerpt ?? "",
        diagnostics: wikipediaLoad.diagnostics ?? [],
      })
    : {
        enabled: false,
        status: "disabled",
        diagnostics: wikipediaLoad.diagnostics ?? [],
        page: null,
        excerpts: [],
        references: [],
      };

  const existingReferences = selectExistingReferenceCandidates(article, compiledSources);
  const allowedReferences = dedupeAllowedReferences(await enrichKnownReferenceCandidates([
    ...existingReferences,
    ...wikipediaReferences,
  ], { fetchImpl }));

  return {
    sectionKey: getFormalCitationSectionConfig(sectionKey).key,
    quoteDocument: clipText(quoteDocument ?? "", MAX_QUOTES_CHARS),
    quoteCorpus: quoteCorpus.map((entry) => ({
      sourceId: entry.sourceId,
      sourceName: entry.sourceName,
      excerpt: entry.excerpt,
      provenance: entry.provenance,
    })),
    compiledSources,
    wikipediaReferences,
    wikipediaSourceDocument: wikipediaLoad.document
      ? {
          sourceId: wikipediaLoad.document.sourceId,
          sourceName: wikipediaLoad.document.sourceName,
          pageTitle: wikipediaLoad.document.pageTitle,
          pageKey: wikipediaLoad.document.pageKey,
          pageUrl: wikipediaLoad.document.pageUrl,
          revisionId: wikipediaLoad.document.revisionId,
          revisionTimestamp: wikipediaLoad.document.revisionTimestamp,
          fetchedAt: wikipediaLoad.document.fetchedAt,
          sourceOrigin: wikipediaLoad.document.sourceOrigin,
          sourceLength: wikipediaLoad.document.source.length,
        }
      : null,
    wikipediaCitationPacket,
    allowedReferences,
    matcherResults,
  };
}

export function summarizeAllowedReferences(references) {
  return (references ?? []).map(summarizeReferenceForPrompt).slice(0, 30);
}
