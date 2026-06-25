import { getAvailabilityQuoteSectionIds } from "../../../../../lib/quoteSections.mjs";
import type { SourceInfo } from "@/hooks/useArticleSources";
import type { QuoteSection } from "@/hooks/useQuotes";
import type { ExtractedSourceInfo } from "@/utils/sectionSources";

export type EvidenceQuoteDocument = {
  slug: string;
  section: QuoteSection;
  content: string;
  updatedAt?: string;
  updatedBy?: string;
  isFromConvex?: boolean;
};

export type EvidenceQuoteSection = {
  section: QuoteSection;
  content: string | null;
  exists: boolean;
  editable: true;
  isFromConvex: boolean;
  updatedAt?: string;
  updatedBy?: string;
  sources: ExtractedSourceInfo | null;
};

export type EvidenceQuoteSections = Record<QuoteSection, EvidenceQuoteSection>;

export type ArticleEvidenceDocument = {
  slug: string | null;
  sourceCorpus: {
    editable: false;
    sources: SourceInfo[];
    contentsBySourceId: Record<string, string>;
  };
  editableQuotes: EvidenceQuoteSections;
  articleReferences: unknown[];
  legacyCitationLinks: {
    sourceCitations: unknown[];
    citations: unknown[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readArrayField(value: unknown, field: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  const candidate = value[field];
  return Array.isArray(candidate) ? candidate : [];
}

export function buildEvidenceQuoteSections(
  quoteDocuments: EvidenceQuoteDocument[],
  buildSources?: (content: string) => ExtractedSourceInfo,
): EvidenceQuoteSections {
  const quoteBySection = new Map<QuoteSection, EvidenceQuoteDocument>();

  for (const quote of quoteDocuments) {
    quoteBySection.set(quote.section, quote);
  }

  return Object.fromEntries(
    getAvailabilityQuoteSectionIds().map((section) => {
      const quote = quoteBySection.get(section as QuoteSection) ?? null;
      const content = quote?.content ?? null;
      return [
        section,
        {
          section,
          content,
          exists: Boolean(quote),
          editable: true,
          isFromConvex: Boolean(quote?.isFromConvex ?? quote),
          updatedAt: quote?.updatedAt,
          updatedBy: quote?.updatedBy,
          sources: content && buildSources ? buildSources(content) : null,
        },
      ];
    }),
  ) as EvidenceQuoteSections;
}

export function buildArticleEvidenceDocument({
  slug,
  availableSources,
  sourceContents,
  quoteDocuments,
  article,
  buildSources,
}: {
  slug: string | null;
  availableSources: SourceInfo[];
  sourceContents: Record<string, string>;
  quoteDocuments: EvidenceQuoteDocument[];
  article?: unknown;
  buildSources?: (content: string) => ExtractedSourceInfo;
}): ArticleEvidenceDocument {
  return {
    slug,
    sourceCorpus: {
      editable: false,
      sources: availableSources,
      contentsBySourceId: sourceContents,
    },
    editableQuotes: buildEvidenceQuoteSections(quoteDocuments, buildSources),
    articleReferences: readArrayField(article, "references"),
    legacyCitationLinks: {
      sourceCitations: readArrayField(article, "source_citations"),
      citations: readArrayField(article, "citations"),
    },
  };
}

export function getEvidenceQuoteContent(
  document: ArticleEvidenceDocument,
  section: QuoteSection,
): string | null {
  return document.editableQuotes[section]?.content ?? null;
}

export function getEvidenceQuoteSources(
  document: ArticleEvidenceDocument,
  section: QuoteSection,
): ExtractedSourceInfo | null {
  return document.editableQuotes[section]?.sources ?? null;
}
