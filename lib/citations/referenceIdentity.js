function toText(value) {
  return String(value ?? "").trim();
}

export function normalizeIdentifier(value) {
  return toText(value)
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeDoi(value) {
  const text = toText(value);
  if (!text) return "";

  const hasDoiPrefix = /^https?:\/\/(dx\.)?doi\.org\//i.test(text) || /^doi:\s*/i.test(text);
  const withoutPrefix = text
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
  const matched = withoutPrefix.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i);
  if (!matched && !hasDoiPrefix) {
    return "";
  }
  const doi = (matched ? matched[0] : withoutPrefix).replace(/[)\].,;:]+$/g, "");
  return doi ? doi.toLowerCase() : "";
}

export function normalizePmid(value) {
  const text = toText(value);
  if (!text) return "";
  if (/^\d{5,10}$/.test(text)) return text;

  const labeled = text.match(/\bPMID\s*:?\s*(\d{5,10})\b/i)
    ?? text.match(/\bpubmed(?:\s+id)?\s*:?\s*(\d{5,10})\b/i);
  if (labeled) return labeled[1];

  try {
    const parsed = new URL(text);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "pubmed.ncbi.nlm.nih.gov") {
      const match = parsed.pathname.match(/^\/(\d{5,10})(?:\/|$)/);
      return match?.[1] ?? "";
    }
    if (hostname === "www.ncbi.nlm.nih.gov" || hostname === "ncbi.nlm.nih.gov") {
      const match = parsed.pathname.match(/^\/pubmed\/(\d{5,10})(?:\/|$)/);
      return match?.[1] ?? "";
    }
  } catch {
    return "";
  }

  return "";
}

export function normalizeIsbn(value) {
  const text = toText(value);
  if (!text) return "";
  const withoutPrefix = text.replace(/^isbn(?:-1[03])?:?\s*/i, "");
  const matched = withoutPrefix.match(/\b(?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dX]\b/i);
  return matched ? matched[0].replace(/[-\s]/g, "").toUpperCase() : "";
}

export function canonicalizeReferenceUrl(value) {
  const text = toText(value);
  if (!text) return "";

  try {
    const parsed = new URL(text);
    const doi = normalizeDoi(text);
    if (doi && /(^|\.)doi\.org$/i.test(parsed.hostname)) {
      return `https://doi.org/${doi}`;
    }

    const pmid = normalizePmid(text);
    if (pmid && (
      parsed.hostname.toLowerCase() === "pubmed.ncbi.nlm.nih.gov"
      || parsed.pathname.toLowerCase().startsWith("/pubmed/")
    )) {
      return `https://pubmed.ncbi.nlm.nih.gov/${pmid}`;
    }

    parsed.hash = "";
    parsed.searchParams.sort();
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return text.replace(/\/+$/, "").toLowerCase();
  }
}

export function getReferenceIdentityKeys(input) {
  const keys = [];
  const seen = new Set();

  const add = (key) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  const doi = normalizeDoi(input?.doi) || normalizeDoi(input?.url);
  if (doi) add(`doi:${doi}`);

  const pmid = normalizePmid(input?.pmid) || normalizePmid(input?.url);
  if (pmid) add(`pmid:${pmid}`);

  const url = canonicalizeReferenceUrl(input?.url);
  if (url) add(`url:${url}`);

  const isbn = normalizeIsbn(input?.isbn);
  if (isbn) add(`isbn:${isbn}`);

  return keys;
}

export function referenceDedupeKey(input) {
  const identityKey = getReferenceIdentityKeys(input)[0];
  if (identityKey) return identityKey;

  const id = toText(input?.id);
  if (id) return `id:${id}`;

  const title = normalizeIdentifier(input?.title ?? input?.name);
  if (title) return `title:${title}`;

  return "unknown:reference";
}

function getSiteSlug(input, canonicalUrl) {
  try {
    const parsed = new URL(canonicalUrl || toText(input?.url));
    return normalizeIdentifier(parsed.hostname.replace(/^www\./i, "").split(".")[0]) || "source";
  } catch {
    return normalizeIdentifier(input?.siteName) || "source";
  }
}

function stableHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(16).padStart(6, "0").slice(0, 6);
}

export function deterministicReferenceId(input) {
  const doi = normalizeDoi(input?.doi) || normalizeDoi(input?.url);
  if (doi) return `doi-${normalizeIdentifier(doi)}`;

  const pmid = normalizePmid(input?.pmid) || normalizePmid(input?.url);
  if (pmid) return `pmid-${normalizeIdentifier(pmid)}`;

  const canonicalUrl = canonicalizeReferenceUrl(input?.url);
  if (canonicalUrl) {
    return `url-${getSiteSlug(input, canonicalUrl)}-${stableHash(canonicalUrl)}`;
  }

  const isbn = normalizeIsbn(input?.isbn);
  if (isbn) return `isbn-${normalizeIdentifier(isbn)}`;

  const title = toText(input?.title ?? input?.name) || "unknown-reference";
  return `url-${getSiteSlug(input, "")}-${stableHash(title.toLowerCase())}`;
}

export function dedupeReferences(references) {
  const seen = new Set();
  const deduped = [];

  for (const reference of references ?? []) {
    const identityKeys = getReferenceIdentityKeys(reference);
    const lookupKeys = identityKeys.length > 0 ? identityKeys : [referenceDedupeKey(reference)];
    if (lookupKeys.some((key) => seen.has(key))) {
      continue;
    }

    for (const key of lookupKeys) {
      seen.add(key);
    }
    deduped.push(reference);
  }

  return deduped;
}
