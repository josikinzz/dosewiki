import { useLibrary } from "@/data/SubstanceIndexProvider";
import { getFaviconForSourceName } from "@/data/config/sourceFavicons";
import {
  loadSubstanceSourcesFromConvex,
  useSubstanceSourceList,
  type SourceInfo,
  type SubstanceModule,
} from "@/hooks/useArticleSources";
import { useQuote } from "@/hooks/useQuotes";
import type { SubstanceArticle } from "@/schema";
import { slugify } from "@/utils/slug";
import {
  parseSourcesFromQuotes,
  type ExtractedSourceInfo,
} from "@/utils/sectionSources";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubstanceEditorContextValue } from "./SubstanceEditorContext";
import { useSourcePreviewState } from "./useSourcePreviewState";
import type { ReviewStatus, SortOrder, SubstanceInfo } from "./types";

const REVIEW_STATUS_FALLBACK: ReviewStatus = "needed";

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
      const recordWithSlug = article as SubstanceArticle & { slug?: unknown };
      const explicitSlug =
        typeof recordWithSlug.slug === "string" ? recordWithSlug.slug.trim() : "";
      const fallbackSlug = slugify(article.title || article.identification.common_name || "");
      const articleSlug = explicitSlug || fallbackSlug;

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

  const summaryQuoteResult = useQuote(selectedSubstanceSlug, "summary");
  const harmPotentialQuoteResult = useQuote(selectedSubstanceSlug, "harm_potential");
  const pharmacologyQuoteResult = useQuote(selectedSubstanceSlug, "pharmacology");
  const historyCultureQuoteResult = useQuote(selectedSubstanceSlug, "history_culture");
  const dosageDurationQuoteResult = useQuote(selectedSubstanceSlug, "dosage_duration");
  const toleranceQuoteResult = useQuote(selectedSubstanceSlug, "tolerance");
  const legalityQuoteResult = useQuote(selectedSubstanceSlug, "legality");

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

  const summaryQuotes = summaryQuoteResult.content;
  const harmPotentialQuotes = harmPotentialQuoteResult.content;
  const pharmacologyQuotes = pharmacologyQuoteResult.content;
  const historyCultureQuotes = historyCultureQuoteResult.content;
  const dosageDurationQuotes = dosageDurationQuoteResult.content;
  const toleranceQuotes = toleranceQuoteResult.content;
  const legalityQuotes = legalityQuoteResult.content;

  const summarySources = useMemo(
    () => (summaryQuotes ? buildSourceInfo(summaryQuotes) : null),
    [buildSourceInfo, summaryQuotes],
  );
  const harmPotentialSources = useMemo(
    () => (harmPotentialQuotes ? buildSourceInfo(harmPotentialQuotes) : null),
    [buildSourceInfo, harmPotentialQuotes],
  );
  const pharmacologySources = useMemo(
    () => (pharmacologyQuotes ? buildSourceInfo(pharmacologyQuotes) : null),
    [buildSourceInfo, pharmacologyQuotes],
  );
  const historyCultureSources = useMemo(
    () => (historyCultureQuotes ? buildSourceInfo(historyCultureQuotes) : null),
    [buildSourceInfo, historyCultureQuotes],
  );
  const dosageDurationSources = useMemo(
    () => (dosageDurationQuotes ? buildSourceInfo(dosageDurationQuotes) : null),
    [buildSourceInfo, dosageDurationQuotes],
  );
  const toleranceSources = useMemo(
    () => (toleranceQuotes ? buildSourceInfo(toleranceQuotes) : null),
    [buildSourceInfo, toleranceQuotes],
  );
  const legalitySources = useMemo(
    () => (legalityQuotes ? buildSourceInfo(legalityQuotes) : null),
    [buildSourceInfo, legalityQuotes],
  );

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
      summaryQuotes,
      harmPotentialQuotes,
      pharmacologyQuotes,
      historyCultureQuotes,
      dosageDurationQuotes,
      toleranceQuotes,
      legalityQuotes,
      summarySources,
      harmPotentialSources,
      pharmacologySources,
      historyCultureSources,
      dosageDurationSources,
      toleranceSources,
      legalitySources,
      getSourceContent,
      getAllSources,
    }),
    [
      apiKey,
      availableSources,
      dosageDurationQuotes,
      dosageDurationSources,
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
    summarySources,
    harmPotentialSources,
    pharmacologySources,
    historyCultureSources,
    dosageDurationSources,
    toleranceSources,
    legalitySources,
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
