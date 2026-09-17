import {
  normalizeIdentifier,
} from "../../lib/citations/referenceIdentity.mjs";
import {
  dedupeAllowedReferences,
  enrichKnownReferenceCandidates,
  selectExistingReferenceCandidates,
} from "./formal-citations-reference-enrichment.mjs";
import {
  getFormalCitationSectionConfig,
} from "./formal-citations-section-config.mjs";
import {
  extractQuoteCorpusEntries,
} from "./formal-citations-quote-documents.mjs";
import {
  canonicalizeSourceId,
  clipText,
  dedupeStrings,
} from "./formal-citations-source-utils.mjs";
import {
  buildWikipediaCitationExcerpts,
  buildWikipediaCitationPacket,
  extractWikipediaReferenceCandidates,
  loadWikipediaSourceForArticle,
} from "./wikipedia-source-enrichment.mjs";

export { extractWikipediaReferenceCandidates } from "./wikipedia-source-enrichment.mjs";
export { loadFormalCitationQuoteDocument } from "./formal-citations-quote-documents.mjs";
export {
  summarizeAllowedReferences,
} from "./formal-citations-reference-enrichment.mjs";

const MAX_QUOTES_CHARS = 12000;
const MAX_SOURCE_EXCERPT_CHARS = 2600;
const MAX_SOURCE_COUNT = 6;

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

function resolveCompiledSourcesForSection({ articleSources, sectionKey, quoteEntries }) {
  const sectionConfig = getFormalCitationSectionConfig(sectionKey);
  const contents = articleSources?.contents ?? {};
  const sources = Array.isArray(articleSources?.sources) ? articleSources.sources : [];

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
      if (scoring.score <= 0) {
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
        sectionScore: scoring.score,
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

export async function buildFormalCitationSourcePacket({
  article,
  articleSources,
  quoteDocument,
  sectionKey,
  fetchImpl = globalThis.fetch,
  wikipediaEnrichment = true,
}) {
  const quoteCorpus = extractQuoteCorpusEntries(quoteDocument);

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
  };
}
