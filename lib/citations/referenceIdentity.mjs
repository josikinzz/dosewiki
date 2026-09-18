function toText(value) {
  return String(value ?? "").trim();
}

export function stripReferenceHtmlMarkup(value) {
  return String(value ?? "")
    .replace(/<\/?(?:sub|sup)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity) => ({
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
      nbsp: " ",
    })[entity.toLowerCase()])
    .replace(/\s+/g, " ")
    .trim();
}

export function hasUnsafeReferenceMarkup(value) {
  const text = typeof value === "string" ? value : "";
  return /<!--|<\s*\/?\s*[A-Za-z][^>]*>|\[\[|\]\]|\{\{|\}\}/i.test(text);
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

  const title = normalizeIdentifier(input?.title ?? input?.name);
  if (title) return `title:${title}`;

  const id = toText(input?.id);
  if (id) return `id:${id}`;

  return "unknown:reference";
}

function referenceIdentityLookupKeys(input) {
  const identityKeys = getReferenceIdentityKeys(input);
  const id = toText(input?.id);
  const lookupKeys = identityKeys.length > 0
    ? identityKeys
    : [referenceDedupeKey(input)];
  return id ? [...lookupKeys, `id:${id}`] : lookupKeys;
}

function stableReferenceIdentifiers(input) {
  return {
    doi: normalizeDoi(input?.doi) || normalizeDoi(input?.url),
    pmid: normalizePmid(input?.pmid) || normalizePmid(input?.url),
    isbn: normalizeIsbn(input?.isbn),
    url: canonicalizeReferenceUrl(input?.url),
  };
}

/**
 * An overlapping key is only evidence of equivalence when no other stable
 * identifier contradicts it. Missing identifiers may be enriched later, but a
 * populated DOI, PMID, ISBN, or canonical URL is never reconciled by guessing.
 */
export function haveCompatibleReferenceIdentity(left, right) {
  const leftIdentifiers = stableReferenceIdentifiers(left);
  const rightIdentifiers = stableReferenceIdentifiers(right);
  return Object.keys(leftIdentifiers).every((field) => (
    !leftIdentifiers[field]
    || !rightIdentifiers[field]
    || leftIdentifiers[field] === rightIdentifiers[field]
  ));
}

export function referenceIdentitiesOverlap(left, right) {
  const rightKeys = new Set(referenceIdentityLookupKeys(right));
  return referenceIdentityLookupKeys(left).some((key) => rightKeys.has(key));
}

const METADATA_PROVENANCE_KINDS = new Set(["inspected", "fetched", "cached", "imported"]);
const METADATA_PROVENANCE_RANK = {
  imported: 1,
  cached: 2,
  fetched: 3,
  inspected: 4,
};
export const MAX_REFERENCE_METADATA_PROVENANCE = 32;

function normalizeProvenanceText(value, maxLength = 512) {
  const text = toText(value);
  return text ? text.slice(0, maxLength) : "";
}

/**
 * Keeps reference metadata lineage small and deterministic enough to survive
 * repeated catalog/workbench merges without growing an article indefinitely.
 */
export function normalizeReferenceMetadataProvenance(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const entries = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const kind = normalizeProvenanceText(raw.kind, 32).toLowerCase();
    const source = normalizeProvenanceText(raw.source, 128);
    if (!METADATA_PROVENANCE_KINDS.has(kind) || !source) continue;

    const entry = { kind, source };
    const provider = normalizeProvenanceText(raw.provider, 128);
    const retrievedAt = normalizeProvenanceText(raw.retrievedAt, 64);
    const artifactDigest = normalizeProvenanceText(raw.artifactDigest, 128);
    const fields = [...new Set(
      (Array.isArray(raw.fields) ? raw.fields : [])
        .map((field) => normalizeProvenanceText(field, 64))
        .filter(Boolean),
    )].slice(0, 64);
    if (provider) entry.provider = provider;
    if (retrievedAt) entry.retrievedAt = retrievedAt;
    if (artifactDigest) entry.artifactDigest = artifactDigest;
    if (fields.length > 0) entry.fields = fields;

    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries
    .sort((left, right) => (
      (METADATA_PROVENANCE_RANK[right.kind] ?? 0) - (METADATA_PROVENANCE_RANK[left.kind] ?? 0)
      || JSON.stringify(left).localeCompare(JSON.stringify(right))
    ))
    .slice(0, MAX_REFERENCE_METADATA_PROVENANCE);
}

function metadataRank(reference, field) {
  let rank = 0;
  for (const entry of normalizeReferenceMetadataProvenance(reference?.metadataProvenance)) {
    if (Array.isArray(entry.fields) && entry.fields.length > 0 && !entry.fields.includes(field)) {
      continue;
    }
    rank = Math.max(rank, METADATA_PROVENANCE_RANK[entry.kind] ?? 0);
  }
  return rank;
}

function isPresentReferenceValue(field, value) {
  if (value == null) return false;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return false;
    if (["type", "template", "sourceType", "access", "supportStatus"].includes(field) && text === "unknown") {
      return false;
    }
    if (field === "quality" && text === "fallback") return false;
    return true;
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function mergeReferenceAuthors(...authorLists) {
  const seen = new Set();
  const authors = [];
  for (const author of authorLists.flat()) {
    const text = typeof author === "string" ? author.trim() : "";
    const key = text.toLocaleLowerCase("en-US");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    authors.push(text);
  }
  return authors;
}

/**
 * Losslessly merges metadata for one canonical source. The first argument is
 * the stored/canonical entry: its marker id is never replaced. Populated scalar
 * conflicts also keep the canonical value unless explicit per-reference
 * metadata provenance proves the incoming field came from a higher-ranked
 * inspected/fetched source.
 */
export function mergeReferenceMetadata(
  canonicalReference = {},
  incomingReference = {},
  { allowTrustedScalarOverride = false } = {},
) {
  // A shared identifier is insufficient when another populated stable identity
  // contradicts it. Direct callers must fail closed just like collection-level
  // matching: do not leak authors, lineage, or trusted scalar metadata across
  // records that may represent different works.
  if (!haveCompatibleReferenceIdentity(canonicalReference, incomingReference)) {
    return { ...canonicalReference };
  }

  const merged = { ...canonicalReference };
  const fields = new Set([
    ...Object.keys(canonicalReference ?? {}),
    ...Object.keys(incomingReference ?? {}),
  ]);

  for (const field of fields) {
    if (field === "id" || field === "authors" || field === "metadataProvenance") continue;
    const canonicalValue = canonicalReference?.[field];
    const incomingValue = incomingReference?.[field];
    if (!isPresentReferenceValue(field, incomingValue)) {
      if (!(field in merged) && field in incomingReference) merged[field] = incomingValue;
      continue;
    }
    if (!isPresentReferenceValue(field, canonicalValue)) {
      merged[field] = incomingValue;
      continue;
    }
    // Stable identifiers are identity constraints, not overridable metadata.
    // Compatible normalized variants keep the stored representation; conflicts
    // must have been rejected before this merge.
    if (["doi", "pmid", "isbn", "url"].includes(field)) continue;

    // Provenance is descriptive, not self-authenticating. Only callers that
    // established it through a trusted workflow may opt into scalar override.
    const incomingRank = metadataRank(incomingReference, field);
    if (allowTrustedScalarOverride
      && incomingRank >= METADATA_PROVENANCE_RANK.fetched
      && incomingRank > metadataRank(canonicalReference, field)) {
      merged[field] = incomingValue;
    }
  }

  if ("id" in canonicalReference) merged.id = canonicalReference.id;
  else if ("id" in incomingReference) merged.id = incomingReference.id;
  merged.authors = mergeReferenceAuthors(
    canonicalReference?.authors ?? [],
    incomingReference?.authors ?? [],
  );
  const metadataProvenance = normalizeReferenceMetadataProvenance([
    ...(canonicalReference?.metadataProvenance ?? []),
    ...(incomingReference?.metadataProvenance ?? []),
  ]);
  if (metadataProvenance.length > 0) merged.metadataProvenance = metadataProvenance;
  return merged;
}

/**
 * Identity-aware list merge. Existing entries are processed first, so their
 * ids remain canonical. The remap includes aliases from identity-equivalent
 * incoming references for callers that also need to rewrite citation markers.
 */
export function mergeReferenceCollections(
  existingReferences = [],
  incomingReferences = [],
  {
    allowTrustedScalarOverride = false,
    retainExistingUnmatched = true,
  } = {},
) {
  const groups = [];
  const keyToGroupIndexes = new Map();

  const rememberKey = (key, index) => {
    if (!keyToGroupIndexes.has(key)) keyToGroupIndexes.set(key, new Set());
    keyToGroupIndexes.get(key).add(index);
  };

  const entries = [
    ...(existingReferences ?? []).map((reference) => ({ reference, incoming: false })),
    ...(incomingReferences ?? []).map((reference) => ({ reference, incoming: true })),
  ];
  for (const { reference, incoming } of entries) {
    if (!reference || typeof reference !== "object") continue;
    const keys = referenceIdentityLookupKeys(reference);
    const matchedIndexes = [...new Set(
      keys.flatMap((key) => [...(keyToGroupIndexes.get(key) ?? [])]),
    )].filter((index) => (
      groups[index]
      && haveCompatibleReferenceIdentity(groups[index].reference, reference)
    ));

    if (matchedIndexes.length === 0) {
      const index = groups.length;
      const normalized = mergeReferenceMetadata({}, reference, { allowTrustedScalarOverride });
      const memberIds = new Set(toText(reference.id) ? [toText(reference.id)] : []);
      groups.push({ reference: normalized, keys: new Set(keys), memberIds, hasIncoming: incoming });
      for (const key of keys) rememberKey(key, index);
      continue;
    }

    const targetIndex = Math.min(...matchedIndexes);
    const target = groups[targetIndex];
    for (const duplicateIndex of matchedIndexes.filter((index) => index !== targetIndex).sort((a, b) => a - b)) {
      const duplicate = groups[duplicateIndex];
      if (!duplicate) continue;
      if (!haveCompatibleReferenceIdentity(target.reference, duplicate.reference)) continue;
      target.reference = mergeReferenceMetadata(target.reference, duplicate.reference, {
        allowTrustedScalarOverride,
      });
      for (const key of duplicate.keys) target.keys.add(key);
      for (const id of duplicate.memberIds) target.memberIds.add(id);
      target.hasIncoming ||= duplicate.hasIncoming;
      groups[duplicateIndex] = null;
    }
    target.reference = mergeReferenceMetadata(target.reference, reference, {
      allowTrustedScalarOverride,
    });
    target.hasIncoming ||= incoming;
    for (const key of keys) target.keys.add(key);
    const id = toText(reference.id);
    if (id) target.memberIds.add(id);
    for (const key of referenceIdentityLookupKeys(target.reference)) target.keys.add(key);
    for (const key of target.keys) rememberKey(key, targetIndex);
  }

  const references = [];
  const remap = new Map();
  for (const group of groups.filter((entry) => (
    entry && (retainExistingUnmatched || entry.hasIncoming)
  ))) {
    references.push(group.reference);
    const canonicalId = toText(group.reference?.id);
    if (!canonicalId) continue;
    remap.set(canonicalId, canonicalId);
    for (const id of group.memberIds) remap.set(id, canonicalId);
  }
  return { references, remap };
}

/**
 * Finds the stored reference that names the same source as `input`.
 *
 * Stored ids are stable marker addresses, but older references may predate the
 * current deterministic id scheme. Matching the canonical DOI/PMID/URL/ISBN
 * identity first keeps those older ids canonical instead of minting aliases
 * that the renderer will later deduplicate away.
 */
export function findEquivalentReference(references, input) {
  const inputKeys = new Set(referenceIdentityLookupKeys(input));
  return (references ?? []).find((reference) => (
    haveCompatibleReferenceIdentity(reference, input)
    && referenceIdentityLookupKeys(reference).some((key) => inputKeys.has(key))
  ));
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
  return (hash >>> 0).toString(16).padStart(8, "0");
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
  return mergeReferenceCollections([], references).references;
}
