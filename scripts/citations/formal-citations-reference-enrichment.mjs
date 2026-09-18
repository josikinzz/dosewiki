import {
  deterministicReferenceId,
  normalizeReferenceMetadataProvenance,
  stripReferenceHtmlMarkup,
} from "../../lib/citations/referenceIdentity.mjs";
import {
  classifyQuality,
  classifySourceType,
  collectFormalCitationReferences,
} from "./formal-citations-reference-catalog.mjs";
import {
  dedupeStrings,
  normalizeTextNeedle,
} from "./formal-citations-source-utils.mjs";
import {
  createMetadataProviderAdapter,
  DEFAULT_METADATA_FETCH_OPTIONS,
  metadataProviderError,
} from "./formal-citations-metadata-providers.mjs";

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
    metadataProvenance: Array.isArray(merged.metadataProvenance) ? merged.metadataProvenance : [],
    metadataDiagnostics: Array.isArray(merged.metadataDiagnostics) ? merged.metadataDiagnostics : [],
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

function normalizeReferenceCandidate(candidate, { identifierLane = null } = {}) {
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
  const doi = identifierLane === "pmid"
    ? null
    : String(candidate?.doi ?? fromStrings.doi ?? "").trim() || null;
  const pmid = identifierLane === "doi"
    ? null
    : String(candidate?.pmid ?? fromStrings.pmid ?? "").trim() || null;
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

const {
  enrichViaCrossref,
  enrichViaOpenAlex,
  enrichViaOpenLibrary,
  enrichViaPubMed,
  mergeMetadataFallback,
  providerProvenance,
  titleDisagreement,
} = createMetadataProviderAdapter({
  buildNormalizedReference,
  candidateToReference,
});


export async function enrichKnownReferenceCandidatesWithDiagnostics(
  candidates,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_METADATA_FETCH_OPTIONS.timeoutMs,
    maxAttempts = DEFAULT_METADATA_FETCH_OPTIONS.maxAttempts,
    retryDelayMs = DEFAULT_METADATA_FETCH_OPTIONS.retryDelayMs,
    sleepImpl,
    identifierLane = null,
  } = {},
) {
  const normalizedCandidates = candidates.map((candidate) => normalizeReferenceCandidate(candidate, { identifierLane }));
  const enriched = [];
  const diagnostics = [];
  const fetchOptions = { timeoutMs, maxAttempts, retryDelayMs, sleepImpl };

  for (const candidate of normalizedCandidates) {
    const metadataProvenance = [];
    const metadataDiagnostics = [];
    let reference = null;

    if (typeof fetchImpl === "function") {
      if (candidate.doi || candidate.pmid) {
        const primaryProvider = candidate.doi ? "crossref" : "pubmed";
        try {
          reference = candidate.doi
            ? await enrichViaCrossref(candidate, fetchImpl, fetchOptions)
            : await enrichViaPubMed(candidate, fetchImpl, fetchOptions);
          metadataProvenance.push(providerProvenance(
            primaryProvider,
            reference ? "success" : "no_record",
            reference,
          ));
        } catch (error) {
          metadataProvenance.push(providerProvenance(primaryProvider, "error", null, error));
          metadataDiagnostics.push({
            code: "primary_provider_failed",
            provider: primaryProvider,
            message: metadataProviderError(error),
          });
        }

        if (!reference?.authors?.length) {
          if (reference) {
            metadataDiagnostics.push({
              code: "primary_provider_missing_authors",
              provider: primaryProvider,
            });
          }
          try {
            const openAlexReference = await enrichViaOpenAlex(candidate, fetchImpl, fetchOptions);
            metadataProvenance.push(providerProvenance(
              "openalex",
              openAlexReference ? "success" : "no_record",
              openAlexReference,
            ));
            if (reference && openAlexReference && titleDisagreement(reference, openAlexReference)) {
              metadataDiagnostics.push({
                code: "provider_title_disagreement",
                providers: [primaryProvider, "openalex"],
                primaryTitle: reference.title,
                fallbackTitle: openAlexReference.title,
              });
            }
            reference = mergeMetadataFallback(reference, openAlexReference);
          } catch (error) {
            metadataProvenance.push(providerProvenance("openalex", "error", null, error));
            metadataDiagnostics.push({
              code: "fallback_provider_failed",
              provider: "openalex",
              message: metadataProviderError(error),
            });
          }
        }
      } else if (candidate.isbn) {
        try {
          reference = await enrichViaOpenLibrary(candidate, fetchImpl, fetchOptions);
          metadataProvenance.push(providerProvenance(
            "openlibrary",
            reference ? "success" : "no_record",
            reference,
          ));
        } catch (error) {
          metadataProvenance.push(providerProvenance("openlibrary", "error", null, error));
          metadataDiagnostics.push({
            code: "primary_provider_failed",
            provider: "openlibrary",
            message: metadataProviderError(error),
          });
        }
      }
    }

    const enrichedReference = buildNormalizedReference(reference ?? candidateToReference(candidate), {
      metadataProvenance: [
        ...(candidate.metadataProvenance ?? []),
        ...metadataProvenance,
      ],
      metadataDiagnostics,
    });
    enriched.push(enrichedReference);
    diagnostics.push({
      referenceId: enrichedReference.id,
      providers: metadataProvenance,
      issues: metadataDiagnostics,
    });
  }

  return { references: enriched, diagnostics };
}

export async function enrichKnownReferenceCandidates(candidates, options = {}) {
  const result = await enrichKnownReferenceCandidatesWithDiagnostics(candidates, options);
  return result.references;
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
  const metadataProvenance = normalizeReferenceMetadataProvenance([
    ...(normalized.metadataProvenance ?? []),
    ...(normalized.metadataProvenance ?? [])
      .filter((entry) => entry?.status === "success" && entry?.provider)
      .map((entry) => ({
        kind: "fetched",
        source: "formal-citation-reference-enrichment",
        provider: entry.provider,
        fields: Array.isArray(entry.fields) ? entry.fields : [],
      })),
  ]);
  return {
    id: normalized.id,
    type: normalized.type,
    title: stripReferenceHtmlMarkup(normalized.title),
    authors: normalized.authors,
    siteName: normalized.siteName,
    url: normalized.url,
    doi: normalized.doi ?? undefined,
    pmid: normalized.pmid ?? undefined,
    isbn: normalized.isbn ?? undefined,
    sourceType: normalized.sourceType,
    quality: normalized.quality,
    ...(metadataProvenance.length > 0 ? { metadataProvenance } : {}),
  };
}

export function summarizeAllowedReferences(references) {
  return (references ?? []).map(summarizeReferenceForPrompt).slice(0, 30);
}
