import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { DiffPreview } from "@/components/common/DiffPreview";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  MODEL_OPTIONS,
  resolveOpenRouterModelId,
  validateApiKey,
} from "@/utils/api/openrouter";
import {
  useSubstanceSourceList,
  loadSubstanceSourcesFromConvex,
  type SourceInfo,
  type SubstanceModule,
} from "@/hooks/useArticleSources";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { normalizeArticleInput, parseGeneratedYaml } from "./yamlParser";
import {
  STORAGE_KEYS,
  type SubstanceEditorTabProps,
  type OutputViewMode,
  type ReviewStatus,
} from "./types";
import { useDevMode } from "../../context/DevModeContext";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";
import type { SubstanceEditorContextValue } from "./SubstanceEditorContext";
import {
  parseSourcesFromQuotes,
  type ExtractedSourceInfo,
} from "@/utils/sectionSources";
import { getFaviconForSourceName } from "@/data/config/sourceFavicons";
import { useQuote } from "@/hooks/useQuotes";
import { slugify } from "@/utils/slug";
import { useSourcePreviewState } from "./useSourcePreviewState";
import { SubstanceEditorOutputSection } from "./SubstanceEditorOutputSection";
import { SubstanceEditorSourcesSection } from "./SubstanceEditorSourcesSection";

const REVIEW_STATUS_META: Record<
  ReviewStatus,
  {
    label: string;
    className: string;
  }
> = {
  needed: {
    label: "Review Needed",
    className: "border-rose-400/30 bg-rose-500/10 text-rose-200/90",
  },
  in_progress: {
    label: "In Progress",
    className: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200/90",
  },
  completed: {
    label: "Completed",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200/90",
  },
};

export const SubstanceEditorTab = memo(function SubstanceEditorTab({
  // Prompt-related props are kept for backwards compatibility but no longer used
  // since section-based generation uses individual prompts per section
  generatorPrompt: _generatorPrompt,
  originalGeneratorPrompt: _originalGeneratorPrompt,
  onPromptChange: _onPromptChange,
  onResetPrompt: _onResetPrompt,
  promptDiff,
  promptHasChanges,
  onCopyPrompt: _onCopyPrompt,
  renderCommitPanel,
  commitPanel,
}: SubstanceEditorTabProps) {
  // API state
  // Use sessionStorage for API key (more secure - cleared when browser closes)
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(STORAGE_KEYS.API_KEY)?.trim() || "";
    }
    return "";
  });
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  // Use localStorage for model preference (not sensitive)
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      return resolveOpenRouterModelId(localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL));
    }
    return DEFAULT_OPENROUTER_MODEL_ID;
  });
  const [isKeyValid, setIsKeyValid] = useState<boolean | null>(null);
  const [isValidatingKey, setIsValidatingKey] = useState(false);

  // Substance selection state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"sources-asc" | "sources-desc" | "alpha-asc" | "alpha-desc">("sources-desc");
  const [showLowPriority, setShowLowPriority] = useState(false);
  const [selectedSubstanceSlug, setSelectedSubstanceSlug] = useState<string | null>(null);
  const [substanceModule, setSubstanceModule] = useState<SubstanceModule | null>(null);
  const [isLoadingSubstance, setIsLoadingSubstance] = useState(false);

  // DevMode context for saving articles
  const { articles, applyArticlesTransform } = useDevMode();
  const { substanceRecords, allSubstanceRecords } = useLibrary();

  // Load substance source list from Convex
  const { substances: allSourceSubstances } = useSubstanceSourceList();
  const reviewStatusBySlug = useMemo(() => {
    const next = new Map<string, ReviewStatus>();

    for (const article of articles) {
      const recordWithSlug = article as SubstanceArticle & { slug?: unknown };
      const explicitSlug = typeof recordWithSlug.slug === "string" ? recordWithSlug.slug.trim() : "";
      const fallbackSlug = slugify(article.title || article.identification.common_name || "");
      const articleSlug = explicitSlug || fallbackSlug;

      if (!articleSlug) {
        continue;
      }

      next.set(articleSlug, article.editorial_review?.status ?? "needed");
    }

    return next;
  }, [articles]);

  // Compute visible substances based on priority toggle
  const substances = useMemo(() => {
    const records = showLowPriority ? allSubstanceRecords : substanceRecords;
    const visibleSlugs = new Set(records.map((r) => r.slug));
    return allSourceSubstances
      .filter((s) => visibleSlugs.has(s.slug))
      .map((s) => ({
        ...s,
        reviewStatus: reviewStatusBySlug.get(s.slug) ?? "needed",
      }));
  }, [allSubstanceRecords, allSourceSubstances, reviewStatusBySlug, showLowPriority, substanceRecords]);

  // Article output state
  const [streamedOutput, setStreamedOutput] = useState("");

  // Output view mode (yaml, preview, or form)
  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>("yaml");

  // Form state for bidirectional sync
  const formRef = useRef<UseArticleFormReturn | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [formParseError, setFormParseError] = useState<string | null>(null);
  const [formArticleOverride, setFormArticleOverride] = useState<SubstanceArticle | null>(null);

  const apiKeyValidationRequestIdRef = useRef(0);

  // Quotes loaded from Convex via hooks
  const summaryQuoteResult = useQuote(selectedSubstanceSlug, "summary");
  const harmPotentialQuoteResult = useQuote(selectedSubstanceSlug, "harm_potential");
  const pharmacologyQuoteResult = useQuote(selectedSubstanceSlug, "pharmacology");
  const historyCultureQuoteResult = useQuote(selectedSubstanceSlug, "history_culture");
  const dosageDurationQuoteResult = useQuote(selectedSubstanceSlug, "dosage_duration");
  const toleranceQuoteResult = useQuote(selectedSubstanceSlug, "tolerance");
  const legalityQuoteResult = useQuote(selectedSubstanceSlug, "legality");

  // Save to database state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sources section collapsed state (collapsed by default)
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  // Persist API key (sessionStorage for security) and model (localStorage for convenience)
  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.API_KEY);
    }
  }, [apiKey]);

  useEffect(() => {
    const normalizedSelectedModel = resolveOpenRouterModelId(selectedModel);

    if (normalizedSelectedModel !== selectedModel) {
      setSelectedModel(normalizedSelectedModel);
      return;
    }

    localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, normalizedSelectedModel);
  }, [selectedModel]);

  const runApiKeyValidation = useCallback(async (candidateApiKey: string) => {
    const trimmedApiKey = candidateApiKey.trim();
    const requestId = ++apiKeyValidationRequestIdRef.current;

    if (!trimmedApiKey || trimmedApiKey.length < 10) {
      setIsKeyValid(null);
      setIsValidatingKey(false);
      return;
    }

    setIsValidatingKey(true);
    const valid = await validateApiKey(trimmedApiKey);

    if (apiKeyValidationRequestIdRef.current !== requestId) {
      return;
    }

    setIsKeyValid(valid);
    setIsValidatingKey(false);
  }, []);

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    void runApiKeyValidation(apiKey);
  }, [apiKey, runApiKeyValidation]);

  const handleApiKeySubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedApiKey = apiKeyInput.trim();
    setApiKeyInput(trimmedApiKey);

    if (trimmedApiKey === apiKey) {
      void runApiKeyValidation(trimmedApiKey);
    }

    setApiKey(trimmedApiKey);
  }, [apiKey, apiKeyInput, runApiKeyValidation]);

  // Filter and sort substances
  const filteredSubstances = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? substances.filter((s) => s.name.toLowerCase().includes(query))
      : [...substances];

    // Sort based on selected order
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

  // Get available sources for selected substance
  const availableSources = useMemo<SourceInfo[]>(() => {
    if (!selectedSubstanceSlug) return [];
    const substance = substances.find((s) => s.slug === selectedSubstanceSlug);
    return substance?.sources ?? [];
  }, [selectedSubstanceSlug]);

  const selectedModelInfo = useMemo(
    () => MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS.find((m) => m.id === DEFAULT_OPENROUTER_MODEL_ID) ?? MODEL_OPTIONS[0],
    [selectedModel]
  );

  // Load substance module when selection changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setSubstanceModule(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setSubstanceModule(null);
    setIsLoadingSubstance(true);
    loadSubstanceSourcesFromConvex(selectedSubstanceSlug)
      .then((module) => {
        setSubstanceModule(module);
        setIsLoadingSubstance(false);
      })
      .catch((err) => {
        console.error("Failed to load substance:", err);
        setIsLoadingSubstance(false);
      });
  }, [selectedSubstanceSlug]);

  // Reset form state when substance changes
  useEffect(() => {
    setFormDirty(false);
    setFormParseError(null);
    setFormArticleOverride(null);
    formRef.current = null;
    setStreamedOutput("");  // Clear stale form data immediately
  }, [selectedSubstanceSlug]);

  // Helper to build ExtractedSourceInfo from quotes content
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

  // Memoized quote content and sources from Convex hooks
  const summaryQuotes = summaryQuoteResult.content;
  const harmPotentialQuotes = harmPotentialQuoteResult.content;
  const pharmacologyQuotes = pharmacologyQuoteResult.content;
  const historyCultureQuotes = historyCultureQuoteResult.content;
  const dosageDurationQuotes = dosageDurationQuoteResult.content;
  const toleranceQuotes = toleranceQuoteResult.content;
  const legalityQuotes = legalityQuoteResult.content;

  // Memoized source info built from quote content
  const summarySources = useMemo(
    () => (summaryQuotes ? buildSourceInfo(summaryQuotes) : null),
    [summaryQuotes, buildSourceInfo]
  );
  const harmPotentialSources = useMemo(
    () => (harmPotentialQuotes ? buildSourceInfo(harmPotentialQuotes) : null),
    [harmPotentialQuotes, buildSourceInfo]
  );
  const pharmacologySources = useMemo(
    () => (pharmacologyQuotes ? buildSourceInfo(pharmacologyQuotes) : null),
    [pharmacologyQuotes, buildSourceInfo]
  );
  const historyCultureSources = useMemo(
    () => (historyCultureQuotes ? buildSourceInfo(historyCultureQuotes) : null),
    [historyCultureQuotes, buildSourceInfo]
  );
  const dosageDurationSources = useMemo(
    () => (dosageDurationQuotes ? buildSourceInfo(dosageDurationQuotes) : null),
    [dosageDurationQuotes, buildSourceInfo]
  );
  const toleranceSources = useMemo(
    () => (toleranceQuotes ? buildSourceInfo(toleranceQuotes) : null),
    [toleranceQuotes, buildSourceInfo]
  );
  const legalitySources = useMemo(
    () => (legalityQuotes ? buildSourceInfo(legalityQuotes) : null),
    [legalityQuotes, buildSourceInfo]
  );

  // Detect and auto-load existing articles when substance is selected
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      return;
    }

    const substance = substances.find((s) => s.slug === selectedSubstanceSlug);
    if (!substance) return;

    const substanceName = substance.name.trim().toLowerCase();
    
    // Match by title first (more reliable), then common_name (only if non-empty)
    const existing = articles.find((a) => {
      const title = a.title?.trim().toLowerCase();
      if (title && title === substanceName) {
        return true;
      }
      const commonName = a.identification?.common_name?.trim().toLowerCase();
      if (commonName && commonName.length > 0 && commonName === substanceName) {
        return true;
      }
      return false;
    });

    if (existing) {
      const normalizedArticle = normalizeArticleInput(existing as Record<string, unknown>);
      const yamlOutput = yaml.stringify(normalizedArticle, { lineWidth: 0, nullStr: "" });
      setStreamedOutput(yamlOutput);
      setFormArticleOverride(normalizedArticle);
      setOutputViewMode("form");
    }
  }, [selectedSubstanceSlug, articles]);

  // Get content for a source
  const getSourceContent = useCallback(
    (sourceId: string): string | null => {
      if (!substanceModule) return null;
      return substanceModule.contents[sourceId] ?? null;
    },
    [substanceModule]
  );

  const {
    fullscreenSource,
    fullscreenSourceContent,
    openSourcePreview,
    closeSourcePreview,
  } = useSourcePreviewState(availableSources, getSourceContent);


  // Copy to clipboard
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(streamedOutput);
  }, [streamedOutput]);

  // Handle output view mode change with bidirectional sync
  const handleOutputViewModeChange = useCallback((mode: OutputViewMode) => {
    // Sync Form → YAML when leaving form tab
    if (outputViewMode === "form" && formDirty && formRef.current) {
      const values = formRef.current.methods.getValues();
      const yamlOutput = yaml.stringify(values, { lineWidth: 0, nullStr: "" });
      setStreamedOutput(yamlOutput);
      setFormArticleOverride(values);
      setFormDirty(false);
    }

    // Sync YAML → Form when entering form tab
    if (mode === "form") {
      const parseResult = parseGeneratedYaml(streamedOutput);
      if (parseResult.success && parseResult.data) {
        setFormParseError(null);
        setFormArticleOverride(parseResult.data);
      } else {
        setFormParseError(parseResult.error ?? "Failed to parse YAML");
        setFormArticleOverride(null);
      }
    }

    setOutputViewMode(mode);
  }, [outputViewMode, formDirty, streamedOutput]);

  // Handle form mutations
  const handleFormMutate = useCallback(() => {
    setFormDirty(true);
  }, []);

  // Download YAML
  const handleDownload = useCallback(() => {
    const selectedSubstance = substances.find((s) => s.slug === selectedSubstanceSlug);
    const blob = new Blob([streamedOutput], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedSubstance?.name ?? "article"}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [streamedOutput, selectedSubstanceSlug]);

  // Save to database (draft or publish)
  const handleSaveToDatabase = useCallback((mode: "draft" | "publish" = "draft") => {
    if (!streamedOutput) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Get article from form if in form mode, else parse YAML
      let article: SubstanceArticle;
      if (outputViewMode === "form" && formRef.current) {
        article = formRef.current.methods.getValues();
      } else {
        const parseResult = parseGeneratedYaml(streamedOutput);
        if (!parseResult.success || !parseResult.data) {
          throw new Error(parseResult.error ?? "Failed to parse YAML");
        }
        article = parseResult.data;
      }

      // Find existing article by ID first (most reliable), then by title/common_name
      let existingIndex = -1;
      
      // 1. Try matching by ID if the article has one
      if (typeof article.id === "number" && Number.isFinite(article.id)) {
        existingIndex = articles.findIndex((a) => a.id === article.id);
      }
      
      // 2. If no ID match, try matching by title (more reliable than common_name)
      if (existingIndex < 0) {
        const title = article.title?.trim().toLowerCase();
        if (title && title.length > 0) {
          existingIndex = articles.findIndex(
            (a) => a.title?.trim().toLowerCase() === title
          );
        }
      }
      
      // 3. Fall back to common_name only if it's non-empty
      if (existingIndex < 0) {
        const commonName = article.identification?.common_name?.trim().toLowerCase();
        if (commonName && commonName.length > 0) {
          existingIndex = articles.findIndex(
            (a) => a.identification?.common_name?.trim().toLowerCase() === commonName
          );
        }
      }

      if (existingIndex >= 0) {
        // Update existing article, preserve its ID
        const existingId = articles[existingIndex].id;
        applyArticlesTransform((prev) => {
          const next = [...prev];
          next[existingIndex] = { ...article, id: existingId };
          return next;
        });
      } else {
        // Create new article with next available ID
        const maxId = articles.reduce((max, a) => Math.max(max, typeof a.id === "number" ? a.id : 0), 0);
        const newId = maxId + 1;
        applyArticlesTransform((prev) => [...prev, { ...article, id: newId }]);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // If publishing, scroll to commit panel
      if (mode === "publish" && commitPanel) {
        // The commit panel is visible, user can proceed to commit
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [streamedOutput, articles, applyArticlesTransform, outputViewMode, commitPanel]);

  const openRouterCredentialInputId = "articles-openrouter-credential";
  const openRouterCredentialHelpId = "articles-openrouter-credential-help";
  const modelSelectId = "articles-model";
  const trimmedApiKeyInput = apiKeyInput.trim();
  const hasPendingApiKeyChange = trimmedApiKeyInput !== apiKey;
  const apiKeySubmitLabel = trimmedApiKeyInput
    ? hasPendingApiKeyChange
      ? apiKey
        ? "Update key"
        : "Save key"
      : "Validate key"
    : apiKey
      ? "Clear key"
      : "Save key";

  // Helper to get all sources as array for section generators
  const getAllSources = useCallback((): Array<{ source: string; content: string }> => {
    if (!substanceModule) return [];
    const sources: Array<{ source: string; content: string }> = [];
    for (const source of availableSources) {
      const content = substanceModule.contents[source.id];
      if (content) {
        sources.push({ source: source.displayName, content });
      }
    }
    return sources;
  }, [substanceModule, availableSources]);

  // Substance editor context value for section generators
  const substanceEditorContextValue = useMemo<SubstanceEditorContextValue>(() => ({
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
  }), [
    apiKey,
    selectedModel,
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
  ]);

  return (
    <div className="mt-6 space-y-6">
      {/* API Configuration */}
      <SectionCard delay={0.1}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
          <Icon icon="lucide:bot" className="h-5 w-5 text-fuchsia-300" size={20} />
          API Configuration
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={openRouterCredentialInputId} className="mb-1.5 block text-sm font-medium text-white/70">
              OpenRouter API Key
            </label>
            <form className="space-y-2" onSubmit={handleApiKeySubmit}>
              <div className="relative">
                <Input
                  id={openRouterCredentialInputId}
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => {
                    setApiKeyInput(event.target.value);
                    if (event.target.value.trim() !== apiKey) {
                      setIsKeyValid(null);
                    }
                  }}
                  placeholder="sk-or-..."
                  className="pr-10"
                  aria-describedby={openRouterCredentialHelpId}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isValidatingKey ? (
                    <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin text-white/40" size={16} />
                  ) : isKeyValid === true ? (
                    <Icon icon="lucide:check" className="h-4 w-4 text-emerald-400" size={16} />
                  ) : isKeyValid === false ? (
                    <Icon icon="lucide:x" className="h-4 w-4 text-red-400" size={16} />
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p id={openRouterCredentialHelpId} className="text-xs text-white/40">
                  Press Enter or {apiKeySubmitLabel.toLowerCase()} to apply this key for the current session.
                </p>
                <Button
                  type="submit"
                  variant="glass"
                  size="pill"
                  disabled={isValidatingKey || (!trimmedApiKeyInput && !apiKey)}
                >
                  {apiKeySubmitLabel}
                </Button>
              </div>
            </form>
            <p className="mt-1.5 text-xs text-white/40">
              Get an API key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fuchsia-300 hover:text-fuchsia-200"
              >
                openrouter.ai
              </a>
            </p>
          </div>
          <div>
            <label htmlFor={modelSelectId} className="mb-1.5 block text-sm font-medium text-white/70">
              Model
            </label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger id={modelSelectId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-xs text-white/50">{m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-white/40">
              Context window: {selectedModelInfo.contextWindow.toLocaleString()} tokens
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Substance Selection */}
      <SectionCard delay={0.15}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
          <Icon icon="lucide:flask-conical" className="h-5 w-5 text-fuchsia-300" size={20} />
          Select Substance
        </h2>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex gap-1">
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("sources-desc")}
              title="Sort by sources (descending)"
              data-active={sortOrder === "sources-desc"}
            >
              <Icon icon="lucide:arrow-up-1-0" className="h-5 w-5" size={20} />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("sources-asc")}
              title="Sort by sources (ascending)"
              data-active={sortOrder === "sources-asc"}
            >
              <Icon icon="lucide:arrow-down-0-1" className="h-5 w-5" size={20} />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("alpha-asc")}
              title="Sort alphabetically (A-Z)"
              data-active={sortOrder === "alpha-asc"}
            >
              <Icon icon="lucide:arrow-up-a-z" className="h-5 w-5" size={20} />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("alpha-desc")}
              title="Sort alphabetically (Z-A)"
              data-active={sortOrder === "alpha-desc"}
            >
              <Icon icon="lucide:arrow-down-z-a" className="h-5 w-5" size={20} />
            </Button>
          </div>
          <Button
            variant={showLowPriority ? "toggleActive" : "toggleInactive"}
            size="pill"
            onClick={() => setShowLowPriority(!showLowPriority)}
            title="Show low-priority substances"
          >
            Low Priority
          </Button>
          <div className="relative flex-1">
            <Icon icon="lucide:search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" size={16} />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search substances..."
              className="pl-10"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40">
          {filteredSubstances.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-white/40">
              No substances found
            </div>
          ) : (
            filteredSubstances.map((substance) => (
              <Button
                key={substance.slug}
                variant="substanceListItem"
                className="justify-between gap-3"
                onClick={() => setSelectedSubstanceSlug(substance.slug)}
                data-active={selectedSubstanceSlug === substance.slug}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-medium">{substance.name}</span>
                  <span className="shrink-0 text-xs text-white/40">
                    ({substance.sources.length} sources)
                  </span>
                </div>
                <Badge
                  variant="secondary"
                  className={REVIEW_STATUS_META[substance.reviewStatus].className}
                >
                  {REVIEW_STATUS_META[substance.reviewStatus].label}
                </Badge>
              </Button>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-white/40">
          {substances.length} substances available
        </p>
      </SectionCard>

      <SubstanceEditorOutputSection
        streamedOutput={streamedOutput}
        outputViewMode={outputViewMode}
        formDirty={formDirty}
        formParseError={formParseError}
        formArticleOverride={formArticleOverride}
        selectedSubstanceSlug={selectedSubstanceSlug}
        onOutputViewModeChange={handleOutputViewModeChange}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onOutputChange={setStreamedOutput}
        onFormMutate={handleFormMutate}
        saveError={saveError}
        formRef={formRef}
        substanceEditorContextValue={substanceEditorContextValue}
      />

      <SubstanceEditorSourcesSection
        substanceModule={substanceModule}
        availableSources={availableSources}
        sourcesExpanded={sourcesExpanded}
        isLoadingSubstance={isLoadingSubstance}
        harmPotentialQuotes={harmPotentialQuotes}
        pharmacologyQuotes={pharmacologyQuotes}
        historyCultureQuotes={historyCultureQuotes}
        onToggleExpanded={() => setSourcesExpanded(!sourcesExpanded)}
        onOpenSourcePreview={openSourcePreview}
        fullscreenSource={fullscreenSource}
        fullscreenSourceContent={fullscreenSourceContent}
        onCloseSourcePreview={closeSourcePreview}
        getSourceContent={getSourceContent}
        harmPotentialSources={harmPotentialSources}
        pharmacologySources={pharmacologySources}
        historyCultureSources={historyCultureSources}
      />

      {/* Prompt Diff */}
      {promptHasChanges && (
        <SectionCard delay={0.4}>
          <h3 className="mb-3 text-sm font-medium text-white/70">Prompt Changes</h3>
          <DiffPreview diffText={promptDiff} />
        </SectionCard>
      )}

      {/* GitHub Commit Panel */}
      {renderCommitPanel ? (
        <div>
          {renderCommitPanel(
            streamedOutput ? (
              <Button
                variant="glass"
                size="pill"
                className="rounded-full"
                onClick={() => handleSaveToDatabase("draft")}
                disabled={isSaving || !streamedOutput}
              >
                {isSaving ? (
                  <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin" size={16} />
                ) : saveSuccess ? (
                  <Icon icon="lucide:check-circle" className="h-4 w-4 text-emerald-400" size={16} />
                ) : (
                  <Icon icon="lucide:save" className="h-4 w-4" size={16} />
                )}
                {saveSuccess ? "Saved!" : "Save Draft"}
              </Button>
            ) : undefined
          )}
        </div>
      ) : commitPanel ? (
        <div>{commitPanel}</div>
      ) : null}
    </div>
  );
});
