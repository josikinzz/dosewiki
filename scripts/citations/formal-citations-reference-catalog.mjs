import {
  deterministicReferenceId,
  mergeReferenceAuthors,
  mergeReferenceCollections,
  normalizeReferenceMetadataProvenance,
} from "../../lib/citations/referenceIdentity.mjs";

function dedupeStrings(values = []) {
  return mergeReferenceAuthors(values);
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
    metadataProvenance: normalizeReferenceMetadataProvenance(reference?.metadataProvenance),
  };
  return normalized;
}



export function canonicalizeArticleReferences(references = []) {
  return mergeReferenceCollections(
    [],
    references.map(normalizeReferenceForArticle),
    { allowTrustedScalarOverride: true },
  );
}
