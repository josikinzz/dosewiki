import { useLibrary } from "@/data/SubstanceIndexProvider";
import { getFaviconForSourceName } from "@/data/config/sourceFavicons";
import {
  loadSubstanceSourcesFromConvex,
  useSubstanceSourceList,
  type SourceInfo,
  type SubstanceModule,
} from "@/hooks/useArticleSources";
import { useQuotesBySlug, type QuoteSection } from "@/hooks/useQuotes";
import type { SubstanceArticle } from "@/schema";
import { getDefaultEditorialReview } from "@/schema";
import { slugify } from "@/utils/slug";
import {
  parseSourcesFromQuotes,
  type ExtractedSourceInfo,
} from "@/utils/sectionSources";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubstanceEditorContextValue } from "./SubstanceEditorContext";
import {
  buildArticleEvidenceDocument,
  getEvidenceQuoteContent,
  getEvidenceQuoteSources,
  type ArticleEvidenceDocument,
} from "./evidenceDocument";
import { useSourcePreviewState } from "./useSourcePreviewState";
import type { ReviewStatus, SortOrder, SubstanceInfo } from "./types";

const REVIEW_STATUS_FALLBACK: ReviewStatus = getDefaultEditorialReview().status;

function resolveArticleSlug(article: SubstanceArticle): string {
  const recordWithSlug = article as SubstanceArticle & { slug?: unknown };
  const explicitSlug =
    typeof recordWithSlug.slug === "string" ? recordWithSlug.slug.trim() : "";
  return explicitSlug || slugify(article.title || article.identification.common_name || "");
}

const QUOTE_LEGACY_FIELDS = {
  summary: {
    content: "summaryQuotes",
    sources: "summarySources",
  },
  harm_potential: {
    content: "harmPotentialQuotes",
    sources: "harmPotentialSources",
  },
  pharmacology: {
    content: "pharmacologyQuotes",
    sources: "pharmacologySources",
  },
  history_culture: {
    content: "historyCultureQuotes",
    sources: "historyCultureSources",
  },
  dosage_duration: {
    content: "dosageDurationQuotes",
    sources: "dosageDurationSources",
  },
  tolerance: {
    content: "toleranceQuotes",
    sources: "toleranceSources",
  },
  legality: {
    content: "legalityQuotes",
    sources: "legalitySources",
  },
  subjective_effects: {
    content: "subjectiveEffectsQuotes",
    sources: "subjectiveEffectsSources",
  },
} satisfies Record<QuoteSection, { content: string; sources: string }>;

type LegacyEvidenceFields = Record<string, string | ExtractedSourceInfo | null>;

function buildLegacyEvidenceFields(document: ArticleEvidenceDocument): LegacyEvidenceFields {
  return Object.fromEntries(
    Object.entries(QUOTE_LEGACY_FIELDS).flatMap(([section, fields]) => [
      [fields.content, getEvidenceQuoteContent(document, section as QuoteSection)],
      [fields.sources, getEvidenceQuoteSources(document, section as QuoteSection)],
    ]),
  );
}

export function useSubstanceEditorSourceData({
  articles,
  apiKey,
  selectedModel,
  isKeyValid,
}: {
  articles: SubstanceArticle[];
  apiKey: string;
  selectedModel: string;
  isKeyValid: boolean | null;
}) {
  const { substanceRecords, allSubstanceRecords } = useLibrary();
  const { substances: allSourceSubstances } = useSubstanceSourceList();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("sources-desc");
  const [showLowPriority, setShowLowPriority] = useState(false);
  const [selectedSubstanceSlug, setSelectedSubstanceSlug] = useState<string | null>(null);
  const [substanceModule, setSubstanceModule] = useState<SubstanceModule | null>(null);
  const [isLoadingSubstance, setIsLoadingSubstance] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  const reviewStatusBySlug = useMemo(() => {
    const next = new Map<string, ReviewStatus>();

    for (const article of articles) {
      const articleSlug = resolveArticleSlug(article);

      if (!articleSlug) {
        continue;
      }

      next.set(articleSlug, article.editorial_review?.status ?? REVIEW_STATUS_FALLBACK);
    }

    return next;
  }, [articles]);

  const substances = useMemo<SubstanceInfo[]>(() => {
    const records = showLowPriority ? allSubstanceRecords : substanceRecords;
    const visibleSlugs = new Set(records.map((record) => record.slug));
    return allSourceSubstances
      .filter((entry) => visibleSlugs.has(entry.slug))
      .map((entry) => ({
        ...entry,
        reviewStatus: reviewStatusBySlug.get(entry.slug) ?? REVIEW_STATUS_FALLBACK,
      }));
  }, [
    allSourceSubstances,
    allSubstanceRecords,
    reviewStatusBySlug,
    showLowPriority,
    substanceRecords,
  ]);

  const filteredSubstances = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? substances.filter((entry) => entry.name.toLowerCase().includes(query))
      : [...substances];

    switch (sortOrder) {
      case "sources-asc":
        filtered.sort((a, b) => a.sources.length - b.sources.length);
        break;
      case "sources-desc":
        filtered.sort((a, b) => b.sources.length - a.sources.length);
        break;
      case "alpha-asc":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "alpha-desc":
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
    }

    return filtered;
  }, [searchQuery, sortOrder, substances]);

  const availableSources = useMemo<SourceInfo[]>(() => {
    if (!selectedSubstanceSlug) {
      return [];
    }

    const substance = substances.find((entry) => entry.slug === selectedSubstanceSlug);
    return substance?.sources ?? [];
  }, [selectedSubstanceSlug, substances]);

  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setSubstanceModule(null);
      return;
    }

    setSubstanceModule(null);
    setIsLoadingSubstance(true);
    loadSubstanceSourcesFromConvex(selectedSubstanceSlug)
      .then((module) => {
        setSubstanceModule(module);
        setIsLoadingSubstance(false);
      })
      .catch((error) => {
        console.error("Failed to load substance:", error);
        setIsLoadingSubstance(false);
      });
  }, [selectedSubstanceSlug]);

  const quoteResult = useQuotesBySlug(selectedSubstanceSlug);

  const buildSourceInfo = useCallback((content: string): ExtractedSourceInfo => {
    const sourceNames = parseSourcesFromQuotes(content);
    return {
      content,
      count: sourceNames.length,
      sources: sourceNames.map((name) => ({
        name,
        favicon: getFaviconForSourceName(name),
      })),
    };
  }, []);

  const selectedArticle = useMemo(
    () =>
      selectedSubstanceSlug
        ? articles.find((article) => resolveArticleSlug(article) === selectedSubstanceSlug) ?? null
        : null,
    [articles, selectedSubstanceSlug],
  );

  const evidenceDocument = useMemo(
    () =>
      buildArticleEvidenceDocument({
        slug: selectedSubstanceSlug,
        availableSources,
        sourceContents: substanceModule?.contents ?? {},
        quoteDocuments: quoteResult.quotes.map((quote) => ({
          slug: quote.slug,
          section: quote.section,
          content: quote.content,
          updatedAt: quote.updatedAt,
          updatedBy: quote.updatedBy,
          isFromConvex: true,
        })),
        article: selectedArticle,
        buildSources: buildSourceInfo,
      }),
    [
      availableSources,
      buildSourceInfo,
      quoteResult.quotes,
      selectedArticle,
      selectedSubstanceSlug,
      substanceModule?.contents,
    ],
  );

  const legacyEvidenceFields = useMemo(
    () => buildLegacyEvidenceFields(evidenceDocument),
    [evidenceDocument],
  );

  const summaryQuotes = legacyEvidenceFields.summaryQuotes as string | null;
  const harmPotentialQuotes = legacyEvidenceFields.harmPotentialQuotes as string | null;
  const pharmacologyQuotes = legacyEvidenceFields.pharmacologyQuotes as string | null;
  const historyCultureQuotes = legacyEvidenceFields.historyCultureQuotes as string | null;
  const dosageDurationQuotes = legacyEvidenceFields.dosageDurationQuotes as string | null;
  const toleranceQuotes = legacyEvidenceFields.toleranceQuotes as string | null;
  const legalityQuotes = legacyEvidenceFields.legalityQuotes as string | null;
  const subjectiveEffectsQuotes = legacyEvidenceFields.subjectiveEffectsQuotes as string | null;

  const summarySources = legacyEvidenceFields.summarySources as ExtractedSourceInfo | null;
  const harmPotentialSources = legacyEvidenceFields.harmPotentialSources as ExtractedSourceInfo | null;
  const pharmacologySources = legacyEvidenceFields.pharmacologySources as ExtractedSourceInfo | null;
  const historyCultureSources = legacyEvidenceFields.historyCultureSources as ExtractedSourceInfo | null;
  const dosageDurationSources = legacyEvidenceFields.dosageDurationSources as ExtractedSourceInfo | null;
  const toleranceSources = legacyEvidenceFields.toleranceSources as ExtractedSourceInfo | null;
  const legalitySources = legacyEvidenceFields.legalitySources as ExtractedSourceInfo | null;
  const subjectiveEffectsSources = legacyEvidenceFields.subjectiveEffectsSources as ExtractedSourceInfo | null;

  const getSourceContent = useCallback(
    (sourceId: string): string | null => {
      if (!substanceModule) {
        return null;
      }
      return substanceModule.contents[sourceId] ?? null;
    },
    [substanceModule],
  );

  const {
    fullscreenSource,
    fullscreenSourceContent,
    openSourcePreview,
    closeSourcePreview,
  } = useSourcePreviewState(availableSources, getSourceContent);

  const getAllSources = useCallback((): Array<{ source: string; content: string }> => {
    if (!substanceModule) {
      return [];
    }

    return availableSources.flatMap((source) => {
      const content = substanceModule.contents[source.id];
      return content ? [{ source: source.displayName, content }] : [];
    });
  }, [availableSources, substanceModule]);

  const substanceEditorContextValue = useMemo<SubstanceEditorContextValue>(
    () => ({
      apiKey,
      model: selectedModel,
      isKeyValid,
      selectedSubstanceSlug,
      substanceModule,
      availableSources,
      evidenceDocument,
      summaryQuotes,
      harmPotentialQuotes,
      pharmacologyQuotes,
      historyCultureQuotes,
      dosageDurationQuotes,
      toleranceQuotes,
      legalityQuotes,
      subjectiveEffectsQuotes,
      summarySources,
      harmPotentialSources,
      pharmacologySources,
      historyCultureSources,
      dosageDurationSources,
      toleranceSources,
      legalitySources,
      subjectiveEffectsSources,
      getSourceContent,
      getAllSources,
    }),
    [
      apiKey,
      availableSources,
      dosageDurationQuotes,
      dosageDurationSources,
      evidenceDocument,
      getAllSources,
      getSourceContent,
      harmPotentialQuotes,
      harmPotentialSources,
      historyCultureQuotes,
      historyCultureSources,
      isKeyValid,
      legalityQuotes,
      legalitySources,
      pharmacologyQuotes,
      pharmacologySources,
      selectedModel,
      selectedSubstanceSlug,
      substanceModule,
      subjectiveEffectsQuotes,
      subjectiveEffectsSources,
      summaryQuotes,
      summarySources,
      toleranceQuotes,
      toleranceSources,
    ],
  );

  return {
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    showLowPriority,
    setShowLowPriority,
    selectedSubstanceSlug,
    setSelectedSubstanceSlug,
    substances,
    filteredSubstances,
    availableSources,
    totalSubstances: substances.length,
    substanceModule,
    isLoadingSubstance,
    summaryQuotes,
    harmPotentialQuotes,
    pharmacologyQuotes,
    historyCultureQuotes,
    dosageDurationQuotes,
    toleranceQuotes,
    legalityQuotes,
    subjectiveEffectsQuotes,
    summarySources,
    harmPotentialSources,
    pharmacologySources,
    historyCultureSources,
    dosageDurationSources,
    toleranceSources,
    legalitySources,
    subjectiveEffectsSources,
    evidenceDocument,
    getSourceContent,
    sourcesExpanded,
    setSourcesExpanded,
    fullscreenSource,
    fullscreenSourceContent,
    openSourcePreview,
    closeSourcePreview,
    substanceEditorContextValue,
  };
}
