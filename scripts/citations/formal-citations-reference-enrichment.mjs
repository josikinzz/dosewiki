import {
  deterministicReferenceId,
} from "../../lib/citations/referenceIdentity.js";
import {
  classifyQuality,
  classifySourceType,
  collectFormalCitationReferences,
} from "./formal-citations-reference-catalog.mjs";
import {
  dedupeStrings,
  normalizeTextNeedle,
  selectYear,
} from "./formal-citations-source-utils.mjs";

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

function normalizeAuthors(authors) {
  if (!Array.isArray(authors)) return [];
  return dedupeStrings(authors.map((author) => {
    if (typeof author === "string") return author;
    const given = String(author?.given ?? "").trim();
    const family = String(author?.family ?? "").trim();
    return [given, family].filter(Boolean).join(" ").trim();
  }));
}

export function buildNormalizedReference(reference, overrides = {}) {
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

export function dedupeAllowedReferences(references) {
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

export function selectExistingReferenceCandidates(article, sectionSources) {
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

export function summarizeAllowedReferences(references) {
  return (references ?? []).map(summarizeReferenceForPrompt).slice(0, 30);
}
