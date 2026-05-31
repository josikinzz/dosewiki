import {
  deterministicReferenceId,
  getReferenceIdentityKeys,
  referenceDedupeKey,
} from "../../lib/citations/referenceIdentity.js";

function dedupeStrings(values = []) {
  const seen = new Set();
  const deduped = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function isPresentValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function preferReferenceField(existingValue, currentValue) {
  return isPresentValue(existingValue) ? existingValue : currentValue;
}

function preferReferenceEnum(existingValue, currentValue, emptyValue) {
  if (typeof existingValue === "string" && existingValue !== emptyValue) {
    return existingValue;
  }
  return typeof currentValue === "string" ? currentValue : existingValue;
}

export function classifySourceType(name = "", url = "") {
  const haystack = `${name} ${url}`.toLowerCase();
  if (haystack.includes("wikipedia")) return "community_wiki";
  if (haystack.includes("psychonautwiki") || haystack.includes("tripsit")) return "drug_database";
  if (haystack.includes("erowid")) return "experience_archive";
  if (haystack.includes("pubmed") || haystack.includes("ncbi.nlm.nih.gov")) return "medical_database";
  if (haystack.includes("doi.org")) return "primary_literature";
  if (haystack.includes(".gov")) return "government_or_regulatory";
  return "unknown";
}

export function classifyQuality(name = "", url = "") {
  const type = classifySourceType(name, url);
  if (["primary_literature", "review_literature", "government_or_regulatory", "medical_database"].includes(type)) return "high";
  if (["drug_database", "harm_reduction_org", "book"].includes(type)) return "medium";
  if (["community_wiki", "experience_archive"].includes(type)) return "low";
  return "fallback";
}

export function legacyCitationToReference(citation, fallbackIndex = 0) {
  const reference = {
    id: "",
    type: "webpage",
    title: citation?.name || citation?.url || `Source ${fallbackIndex + 1}`,
    authors: [],
    siteName: citation?.name || null,
    url: citation?.url || null,
    sourceType: classifySourceType(citation?.name, citation?.url),
    quality: classifyQuality(citation?.name, citation?.url),
  };
  return { ...reference, id: deterministicReferenceId(reference) };
}

export function collectFormalCitationReferences(article) {
  return [
    ...(Array.isArray(article?.references) ? article.references : []),
    ...(Array.isArray(article?.source_citations)
      ? article.source_citations.map((citation, index) => legacyCitationToReference(citation, index))
      : []),
  ].map((reference) => {
    const id = reference?.id || deterministicReferenceId(reference ?? {});
    return { ...reference, id };
  });
}

export function normalizeReferenceForArticle(reference = {}) {
  const normalized = {
    id: typeof reference?.id === "string" && reference.id.trim()
      ? reference.id.trim()
      : deterministicReferenceId(reference),
    type: reference?.type ?? "webpage",
    title: reference?.title ?? reference?.name ?? reference?.url ?? "Untitled reference",
    authors: dedupeStrings(Array.isArray(reference?.authors) ? reference.authors : []),
    year: reference?.year ?? null,
    date: reference?.date ?? null,
    containerTitle: reference?.containerTitle ?? null,
    siteName: reference?.siteName ?? reference?.name ?? null,
    publisher: reference?.publisher ?? null,
    volume: reference?.volume ?? null,
    issue: reference?.issue ?? null,
    pages: reference?.pages ?? null,
    articleNumber: reference?.articleNumber ?? null,
    doi: reference?.doi ?? null,
    pmid: reference?.pmid ?? null,
    isbn: reference?.isbn ?? null,
    url: reference?.url ?? null,
    accessedAt: reference?.accessedAt ?? null,
    sourceType: reference?.sourceType ?? classifySourceType(reference?.title, reference?.url),
    quality: reference?.quality ?? classifyQuality(reference?.title, reference?.url),
    apaText: reference?.apaText ?? null,
  };
  normalized.id = deterministicReferenceId(normalized);
  return normalized;
}

export function mergeArticleReferences(existingReference, currentReference) {
  const existing = normalizeReferenceForArticle(existingReference);
  const current = normalizeReferenceForArticle(currentReference);
  const merged = {
    ...existing,
    type: preferReferenceEnum(existing.type, current.type, "unknown"),
    title: preferReferenceField(existing.title, current.title),
    authors: dedupeStrings([...(existing.authors ?? []), ...(current.authors ?? [])]),
    year: preferReferenceField(existing.year, current.year),
    date: preferReferenceField(existing.date, current.date),
    containerTitle: preferReferenceField(existing.containerTitle, current.containerTitle),
    siteName: preferReferenceField(existing.siteName, current.siteName),
    publisher: preferReferenceField(existing.publisher, current.publisher),
    volume: preferReferenceField(existing.volume, current.volume),
    issue: preferReferenceField(existing.issue, current.issue),
    pages: preferReferenceField(existing.pages, current.pages),
    articleNumber: preferReferenceField(existing.articleNumber, current.articleNumber),
    doi: preferReferenceField(existing.doi, current.doi),
    pmid: preferReferenceField(existing.pmid, current.pmid),
    isbn: preferReferenceField(existing.isbn, current.isbn),
    url: preferReferenceField(existing.url, current.url),
    accessedAt: preferReferenceField(existing.accessedAt, current.accessedAt),
    sourceType: preferReferenceEnum(existing.sourceType, current.sourceType, "unknown"),
    quality: preferReferenceEnum(existing.quality, current.quality, "fallback"),
    apaText: preferReferenceField(existing.apaText, current.apaText),
  };
  merged.id = deterministicReferenceId(merged);
  return merged;
}

export function canonicalizeArticleReferences(references = []) {
  const groups = [];
  const keyToGroupIndex = new Map();
  const remap = new Map();

  for (const reference of references) {
    const normalized = normalizeReferenceForArticle(reference);
    const lookupKeys = getReferenceIdentityKeys(normalized);
    const fallbackKey = referenceDedupeKey(normalized);
    const matchedGroupIndexes = [...new Set(
      [...(lookupKeys.length > 0 ? lookupKeys : [fallbackKey])]
        .map((key) => keyToGroupIndex.get(key))
        .filter((value) => value !== undefined),
    )];
    const priorIds = dedupeStrings([reference?.id, normalized.id]);

    if (matchedGroupIndexes.length === 0) {
      const mergedReference = normalizeReferenceForArticle(normalized);
      const nextIndex = groups.length;
      const keys = new Set([fallbackKey, ...lookupKeys, ...getReferenceIdentityKeys(mergedReference)]);
      groups.push({
        reference: mergedReference,
        keys,
        memberIds: new Set(dedupeStrings([...priorIds, mergedReference.id])),
      });
      for (const key of keys) {
        keyToGroupIndex.set(key, nextIndex);
      }
      for (const id of priorIds) {
        remap.set(id, mergedReference.id);
      }
      continue;
    }

    const groupIndex = matchedGroupIndexes[0];
    const group = groups[groupIndex];
    for (const duplicateGroupIndex of matchedGroupIndexes.slice(1)) {
      const duplicateGroup = groups[duplicateGroupIndex];
      if (!duplicateGroup) continue;
      group.reference = mergeArticleReferences(group.reference, duplicateGroup.reference);
      group.keys = new Set([...group.keys, ...duplicateGroup.keys]);
      for (const id of duplicateGroup.memberIds) {
        group.memberIds.add(id);
      }
      groups[duplicateGroupIndex] = null;
    }
    group.memberIds.add(group.reference.id);
    for (const id of priorIds) {
      group.memberIds.add(id);
    }

    group.reference = mergeArticleReferences(group.reference, normalized);
    group.keys = new Set([
      ...group.keys,
      fallbackKey,
      ...lookupKeys,
      referenceDedupeKey(group.reference),
      ...getReferenceIdentityKeys(group.reference),
    ]);

    for (const key of group.keys) {
      keyToGroupIndex.set(key, groupIndex);
    }
    for (const id of group.memberIds) {
      remap.set(id, group.reference.id);
    }
  }

  const canonicalReferences = groups.filter(Boolean).map((group) => group.reference);
  for (const reference of canonicalReferences) {
    remap.set(reference.id, reference.id);
  }

  return { references: canonicalReferences, remap };
}
