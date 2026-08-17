import {
  dedupeStrings,
  normalizeTextNeedle,
  selectYear,
} from "./formal-citations-source-utils.mjs";

export const DEFAULT_METADATA_FETCH_OPTIONS = Object.freeze({
  timeoutMs: 8_000,
  maxAttempts: 2,
  retryDelayMs: 250,
});

export function metadataProviderError(error) {
  return error instanceof Error ? error.message : String(error);
}

function shouldRetryMetadataResponse(status) {
  return status === 429 || status >= 500;
}

async function fetchJson(url, fetchImpl, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_METADATA_FETCH_OPTIONS.timeoutMs;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_METADATA_FETCH_OPTIONS.maxAttempts);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_METADATA_FETCH_OPTIONS.retryDelayMs;
  const sleepImpl = options.sleepImpl ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const response = await fetchImpl(url, {
        headers: {
          "user-agent": "DoseWiki Formal Citations/1.0",
          accept: "application/json",
        },
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.retryable = shouldRetryMetadataResponse(response.status);
        if (!error.retryable || attempt === maxAttempts) throw error;
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      if (error?.retryable === false || attempt === maxAttempts) throw error;
    } finally {
      clearTimeout(timer);
    }
    await sleepImpl(retryDelayMs * attempt);
  }

  throw lastError ?? new Error(`Metadata request failed for ${url}`);
}

function withProviderFields(reference, fields) {
  Object.defineProperty(reference, "providerFields", {
    value: dedupeStrings(fields),
    enumerable: false,
  });
  return reference;
}

export function createMetadataProviderAdapter({
  buildNormalizedReference,
  candidateToReference,
}) {
  async function enrichViaCrossref(candidate, fetchImpl, fetchOptions) {
    const doi = candidate.doi;
    if (!doi) return null;

    const response = await fetchJson(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      fetchImpl,
      fetchOptions,
    );
    const message = response?.message;
    if (!message) return null;

    return withProviderFields(candidateToReference(candidate, {
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
    }), [
      ...(message.title ? ["title"] : []),
      ...(Array.isArray(message.author) && message.author.length > 0 ? ["authors"] : []),
      ...(Array.isArray(message["container-title"]) && message["container-title"][0] ? ["siteName"] : []),
      ...(message.URL ? ["url"] : []),
      "doi",
      ...(message.issued?.["date-parts"]?.[0]?.[0] || message.created?.["date-parts"]?.[0]?.[0] ? ["year"] : []),
      ...(message.publisher ? ["publisher"] : []),
    ]);
  }

  async function enrichViaPubMed(candidate, fetchImpl, fetchOptions) {
    const pmid = candidate.pmid;
    if (!pmid) return null;

    const response = await fetchJson(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`,
      fetchImpl,
      fetchOptions,
    );
    const record = response?.result?.[pmid];
    if (!record) return null;

    return withProviderFields(candidateToReference(candidate, {
      title: record.title ?? candidate.title,
      authors: Array.isArray(record.authors) ? record.authors.map((author) => author.name) : candidate.authors,
      siteName: record.fulljournalname ?? candidate.siteName ?? "PubMed",
      url: candidate.url ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      pmid,
      year: selectYear(record.pubdate ?? record.sortpubdate) ?? candidate.year,
      sourceType: candidate.doi ? "primary_literature" : "medical_database",
      quality: "high",
    }), [
      ...(record.title ? ["title"] : []),
      ...(Array.isArray(record.authors) && record.authors.length > 0 ? ["authors"] : []),
      ...(record.fulljournalname ? ["siteName"] : []),
      "pmid",
      ...(selectYear(record.pubdate ?? record.sortpubdate) ? ["year"] : []),
    ]);
  }

  async function enrichViaOpenAlex(candidate, fetchImpl, fetchOptions) {
    const lookup = candidate.doi
      ? `https://doi.org/${candidate.doi}`
      : candidate.pmid
        ? `pmid:${candidate.pmid}`
        : null;
    if (!lookup) return null;

    const record = await fetchJson(
      `https://api.openalex.org/works/${encodeURIComponent(lookup)}`,
      fetchImpl,
      fetchOptions,
    );
    if (!record?.id) return null;

    return withProviderFields(candidateToReference(candidate, {
      type: record.type === "book" ? "book" : "webpage",
      title: record.display_name ?? candidate.title,
      authors: Array.isArray(record.authorships)
        ? record.authorships.map((authorship) => authorship?.author?.display_name).filter(Boolean)
        : candidate.authors,
      siteName: record.primary_location?.source?.display_name ?? candidate.siteName,
      url: candidate.url
        ?? record.primary_location?.landing_page_url
        ?? record.doi
        ?? (candidate.doi ? `https://doi.org/${candidate.doi}` : null),
      doi: candidate.doi,
      pmid: candidate.pmid,
      year: record.publication_year ?? candidate.year,
      publisher: record.primary_location?.source?.host_organization_name ?? candidate.publisher,
      sourceType: "primary_literature",
      quality: "high",
    }), [
      ...(record.display_name ? ["title"] : []),
      ...(Array.isArray(record.authorships) && record.authorships.length > 0 ? ["authors"] : []),
      ...(record.primary_location?.source?.display_name ? ["siteName"] : []),
      ...(record.primary_location?.landing_page_url || record.doi ? ["url"] : []),
      ...(candidate.doi ? ["doi"] : []),
      ...(candidate.pmid ? ["pmid"] : []),
      ...(record.publication_year ? ["year"] : []),
      ...(record.primary_location?.source?.host_organization_name ? ["publisher"] : []),
    ]);
  }

  async function enrichViaOpenLibrary(candidate, fetchImpl, fetchOptions) {
    const isbn = candidate.isbn;
    if (!isbn) return null;

    const response = await fetchJson(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`,
      fetchImpl,
      fetchOptions,
    );
    const record = response?.[`ISBN:${isbn}`];
    if (!record) return null;

    return withProviderFields(candidateToReference(candidate, {
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
    }), [
      ...(record.title ? ["title"] : []),
      ...(Array.isArray(record.authors) && record.authors.length > 0 ? ["authors"] : []),
      ...(record.url ? ["url"] : []),
      "isbn",
      ...(selectYear(record.publish_date) ? ["year"] : []),
      ...(Array.isArray(record.publishers) && record.publishers.length > 0 ? ["publisher"] : []),
    ]);
  }

  function providerProvenance(provider, status, reference = null, error = null) {
    return {
      provider,
      status,
      title: reference?.title ?? null,
      authorCount: Array.isArray(reference?.authors) ? reference.authors.length : 0,
      fields: Array.isArray(reference?.providerFields) ? reference.providerFields : [],
      error: error ? metadataProviderError(error) : null,
    };
  }

  function mergeMetadataFallback(primary, fallback) {
    if (!primary) return fallback;
    if (!fallback) return primary;
    return buildNormalizedReference(primary, {
      authors: primary.authors?.length ? primary.authors : fallback.authors,
      siteName: primary.siteName || fallback.siteName,
      url: primary.url || fallback.url,
      doi: primary.doi || fallback.doi,
      pmid: primary.pmid || fallback.pmid,
      year: primary.year || fallback.year,
      publisher: primary.publisher || fallback.publisher,
    });
  }

  function titleDisagreement(primary, fallback) {
    if (!primary?.title || !fallback?.title) return false;
    return normalizeTextNeedle(primary.title) !== normalizeTextNeedle(fallback.title);
  }

  return {
    enrichViaCrossref,
    enrichViaOpenAlex,
    enrichViaOpenLibrary,
    enrichViaPubMed,
    mergeMetadataFallback,
    providerProvenance,
    titleDisagreement,
  };
}
