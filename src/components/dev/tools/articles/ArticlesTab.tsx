import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import yaml from "yaml";
import { Icon } from "../../../common/Icon";
import { SectionCard } from "../../../common/SectionCard";
import { DiffPreview } from "../../../common/DiffPreview";
import { JsonEditor } from "../../../common/JsonEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MODEL_OPTIONS,
  validateApiKey,
} from "../../../../utils/api/openrouter";
import {
  substances as allSourceSubstances,
  loadSubstanceSources,
  type SourceInfo,
  type SubstanceModule,
} from "../../../../data/article-sources";
import { useLibrary } from "../../../../data/ArticlesProvider";
import { GeneratorOutputPreview } from "./GeneratorOutputPreview";
import { SourcePreviewModal } from "./SourcePreviewModal";
import { parseGeneratedYaml } from "./yamlParser";
import {
  STORAGE_KEYS,
  type ArticlesTabProps,
  type OutputViewMode,
} from "./types";
import { useDevMode } from "../../DevModeContext";
import { ArticleDraftFormFieldsRHF } from "../../forms/ArticleDraftFormFieldsRHF";
import type { UseArticleFormReturn } from "../../../../hooks/useArticleForm";
import type { SubstanceArticle } from "../../../../schema";
import { ArticlesProvider, type ArticlesContextValue } from "./ArticlesContext";
import {
  loadHarmPotentialQuotes,
  loadPharmacologyQuotes,
  loadHistoryCultureQuotes,
  loadSummaryQuotes,
  loadDosageDurationQuotes,
  loadToleranceQuotes,
  loadLegalityQuotes,
  parseSourcesFromQuotes,
  type ExtractedSourceInfo,
} from "../../../../utils/sectionSources";
import { getFaviconForSourceName } from "../../../../data/config/sourceFavicons";

export const ArticlesTab = memo(function ArticlesTab({
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
}: ArticlesTabProps) {
  // API state
  // Use sessionStorage for API key (more secure - cleared when browser closes)
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(STORAGE_KEYS.API_KEY) || "";
    }
    return "";
  });
  // Use localStorage for model preference (not sensitive)
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL) || MODEL_OPTIONS[0].id;
    }
    return MODEL_OPTIONS[0].id;
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

  // Compute visible substances based on priority toggle
  const substances = useMemo(() => {
    const records = showLowPriority ? allSubstanceRecords : substanceRecords;
    const visibleSlugs = new Set(records.map((r) => r.slug));
    return allSourceSubstances.filter((s) => visibleSlugs.has(s.slug));
  }, [allSubstanceRecords, showLowPriority, substanceRecords]);

  // Article output state
  const [streamedOutput, setStreamedOutput] = useState("");

  // Output view mode (yaml, preview, or form)
  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>("yaml");

  // Form state for bidirectional sync
  const formRef = useRef<UseArticleFormReturn | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [formParseError, setFormParseError] = useState<string | null>(null);

  // Source preview state
  const [fullscreenSourceId, setFullscreenSourceId] = useState<string | null>(null);

  // Extracted quotes for section generators
  const [summaryQuotes, setSummaryQuotes] = useState<string | null>(null);
  const [harmPotentialQuotes, setHarmPotentialQuotes] = useState<string | null>(null);
  const [pharmacologyQuotes, setPharmacologyQuotes] = useState<string | null>(null);
  const [historyCultureQuotes, setHistoryCultureQuotes] = useState<string | null>(null);
  const [dosageDurationQuotes, setDosageDurationQuotes] = useState<string | null>(null);
  const [toleranceQuotes, setToleranceQuotes] = useState<string | null>(null);
  const [legalityQuotes, setLegalityQuotes] = useState<string | null>(null);

  // Parsed source info with favicons
  const [summarySources, setSummarySources] = useState<ExtractedSourceInfo | null>(null);
  const [harmPotentialSources, setHarmPotentialSources] = useState<ExtractedSourceInfo | null>(null);
  const [pharmacologySources, setPharmacologySources] = useState<ExtractedSourceInfo | null>(null);
  const [historyCultureSources, setHistoryCultureSources] = useState<ExtractedSourceInfo | null>(null);
  const [dosageDurationSources, setDosageDurationSources] = useState<ExtractedSourceInfo | null>(null);
  const [toleranceSources, setToleranceSources] = useState<ExtractedSourceInfo | null>(null);
  const [legalitySources, setLegalitySources] = useState<ExtractedSourceInfo | null>(null);

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
    localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, selectedModel);
  }, [selectedModel]);

  // Validate API key on change
  useEffect(() => {
    if (!apiKey || apiKey.length < 10) {
      setIsKeyValid(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidatingKey(true);
      const valid = await validateApiKey(apiKey);
      setIsKeyValid(valid);
      setIsValidatingKey(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [apiKey]);

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
    () => MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0],
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
    loadSubstanceSources(selectedSubstanceSlug)
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
    setFullscreenSourceId(null);
    setFormDirty(false);
    setFormParseError(null);
    formRef.current = null;
    setStreamedOutput("");  // Clear stale form data immediately
  }, [selectedSubstanceSlug]);

  // Helper to build ExtractedSourceInfo from quotes content
  const buildSourceInfo = useCallback((content: string): ExtractedSourceInfo => {
    const sourceNames = parseSourcesFromQuotes(content);
    return {
      content,
      count: sourceNames.length,
      sources: sourceNames.map(name => ({
        name,
        favicon: getFaviconForSourceName(name),
      })),
    };
  }, []);

  // Load summary quotes when substance changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setSummaryQuotes(null);
      setSummarySources(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setSummaryQuotes(null);
    setSummarySources(null);
    loadSummaryQuotes(selectedSubstanceSlug).then((quotes) => {
      setSummaryQuotes(quotes);
      if (quotes) {
        setSummarySources(buildSourceInfo(quotes));
      }
    });
  }, [selectedSubstanceSlug, buildSourceInfo]);

  // Load harm potential quotes when substance changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setHarmPotentialQuotes(null);
      setHarmPotentialSources(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setHarmPotentialQuotes(null);
    setHarmPotentialSources(null);
    loadHarmPotentialQuotes(selectedSubstanceSlug).then((quotes) => {
      setHarmPotentialQuotes(quotes);
      if (quotes) {
        setHarmPotentialSources(buildSourceInfo(quotes));
      }
    });
  }, [selectedSubstanceSlug, buildSourceInfo]);

  // Load pharmacology quotes when substance changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setPharmacologyQuotes(null);
      setPharmacologySources(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setPharmacologyQuotes(null);
    setPharmacologySources(null);
    loadPharmacologyQuotes(selectedSubstanceSlug).then((quotes) => {
      setPharmacologyQuotes(quotes);
      if (quotes) {
        setPharmacologySources(buildSourceInfo(quotes));
      }
    });
  }, [selectedSubstanceSlug, buildSourceInfo]);

  // Load history & culture quotes when substance changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setHistoryCultureQuotes(null);
      setHistoryCultureSources(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setHistoryCultureQuotes(null);
    setHistoryCultureSources(null);
    loadHistoryCultureQuotes(selectedSubstanceSlug).then((quotes) => {
      setHistoryCultureQuotes(quotes);
      if (quotes) {
        setHistoryCultureSources(buildSourceInfo(quotes));
      }
    });
  }, [selectedSubstanceSlug, buildSourceInfo]);

  // Load dosage & duration quotes when substance changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setDosageDurationQuotes(null);
      setDosageDurationSources(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setDosageDurationQuotes(null);
    setDosageDurationSources(null);
    loadDosageDurationQuotes(selectedSubstanceSlug).then((quotes) => {
      setDosageDurationQuotes(quotes);
      if (quotes) {
        setDosageDurationSources(buildSourceInfo(quotes));
      }
    });
  }, [selectedSubstanceSlug, buildSourceInfo]);

  // Load tolerance quotes when substance changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setToleranceQuotes(null);
      setToleranceSources(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setToleranceQuotes(null);
    setToleranceSources(null);
    loadToleranceQuotes(selectedSubstanceSlug).then((quotes) => {
      setToleranceQuotes(quotes);
      if (quotes) {
        setToleranceSources(buildSourceInfo(quotes));
      }
    });
  }, [selectedSubstanceSlug, buildSourceInfo]);

  // Load legality quotes when substance changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setLegalityQuotes(null);
      setLegalitySources(null);
      return;
    }

    // Clear stale data immediately before loading new data
    setLegalityQuotes(null);
    setLegalitySources(null);
    loadLegalityQuotes(selectedSubstanceSlug).then((quotes) => {
      setLegalityQuotes(quotes);
      if (quotes) {
        setLegalitySources(buildSourceInfo(quotes));
      }
    });
  }, [selectedSubstanceSlug, buildSourceInfo]);

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
      // Auto-load the existing article
      const yamlOutput = yaml.stringify(existing, { lineWidth: 0, nullStr: "" });
      setStreamedOutput(yamlOutput);
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
      setFormDirty(false);
    }

    // Sync YAML → Form when entering form tab
    if (mode === "form") {
      const parseResult = parseGeneratedYaml(streamedOutput);
      if (parseResult.success && parseResult.data) {
        setFormParseError(null);
        // Form will receive the parsed article as prop and reset via useEffect
      } else {
        setFormParseError(parseResult.error ?? "Failed to parse YAML");
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

  const apiKeyInputId = "articles-openrouter-key";
  const modelSelectId = "articles-model";

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

  // Articles context value for section generators
  const articlesContextValue = useMemo<ArticlesContextValue>(() => ({
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
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Icon icon="lucide:bot" className="h-5 w-5 text-fuchsia-300" size={20} />
          API Configuration
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={apiKeyInputId} className="mb-1.5 block text-sm font-medium text-white/70">
              OpenRouter API Key
            </label>
            <div className="relative">
              <Input
                id={apiKeyInputId}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                className="pr-10"
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
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
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
                onClick={() => setSelectedSubstanceSlug(substance.slug)}
                data-active={selectedSubstanceSlug === substance.slug}
              >
                <span className="font-medium">{substance.name}</span>
                <span className="ml-2 text-xs text-white/40">
                  ({substance.sources.length} sources)
                </span>
              </Button>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-white/40">
          {substances.length} substances available
        </p>
      </SectionCard>

      {/* Output */}
      {streamedOutput && (
        <SectionCard delay={0.25}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Substance Article</h2>
              {formDirty && outputViewMode === "form" && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                  Unsaved changes
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Tabs
                value={outputViewMode}
                onValueChange={(v) => handleOutputViewModeChange(v as OutputViewMode)}
              >
                <TabsList>
                  <TabsTrigger value="yaml">YAML</TabsTrigger>
                  <TabsTrigger value="form">
                    <Icon icon="lucide:file-edit" className="mr-1.5 h-3.5 w-3.5" size={14} />
                    Form
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    Preview
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex gap-2">
                <Button
                  variant="glass"
                  size="pill"
                  onClick={handleCopy}
                >
                  <Icon icon="lucide:copy" className="h-3.5 w-3.5" size={14} />
                  Copy
                </Button>
                <Button
                  variant="glass"
                  size="pill"
                  onClick={handleDownload}
                >
                  <Icon icon="lucide:download" className="h-3.5 w-3.5" size={14} />
                  Download
                </Button>
              </div>
            </div>
          </div>
          {saveError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-400">
              <Icon icon="lucide:alert-triangle" className="h-4 w-4" size={16} />
              {saveError}
            </div>
          )}
          {outputViewMode === "yaml" && (
            <JsonEditor
              id="generated-output"
              value={streamedOutput}
              onChange={setStreamedOutput}
              minHeight={400}
            />
          )}
          {outputViewMode === "form" && (
            (() => {
              if (formParseError) {
                return (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                    <div className="mb-4 flex items-center gap-2 text-red-400">
                      <Icon icon="lucide:alert-circle" className="h-5 w-5" size={20} />
                      <span className="font-medium">Failed to parse YAML</span>
                    </div>
                    <p className="mb-4 text-sm text-white/70">{formParseError}</p>
                    <Button
                      variant="glass"
                      size="pill"
                      onClick={() => handleOutputViewModeChange("yaml")}
                    >
                      Switch to YAML
                    </Button>
                  </div>
                );
              }
              const parseResult = parseGeneratedYaml(streamedOutput);
              if (!parseResult.success || !parseResult.data) {
                return (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                    <div className="mb-4 flex items-center gap-2 text-red-400">
                      <Icon icon="lucide:alert-circle" className="h-5 w-5" size={20} />
                      <span className="font-medium">Failed to parse YAML</span>
                    </div>
                    <p className="mb-4 text-sm text-white/70">{parseResult.error ?? "Unknown error"}</p>
                    <Button
                      variant="glass"
                      size="pill"
                      onClick={() => handleOutputViewModeChange("yaml")}
                    >
                      Switch to YAML
                    </Button>
                  </div>
                );
              }
              return (
                <ArticlesProvider value={articlesContextValue}>
                  <ArticleDraftFormFieldsRHF
                    key={selectedSubstanceSlug}
                    idPrefix="generator-form"
                    article={parseResult.data}
                    onMutate={handleFormMutate}
                    formRef={formRef}
                  />
                </ArticlesProvider>
              );
            })()
          )}
          {outputViewMode === "preview" && (
            <GeneratorOutputPreview yamlContent={streamedOutput} />
          )}
        </SectionCard>
      )}

      {/* Source Previews - Collapsible */}
      {substanceModule && availableSources.length > 0 && (
        <SectionCard delay={0.3}>
          <button
            type="button"
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex w-full items-center justify-between text-left hover:opacity-80 transition-opacity"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Icon icon="lucide:file-text" className="h-5 w-5 text-fuchsia-300" size={20} />
              Available Sources
              <span className="text-sm font-normal text-white/50">
                ({availableSources.length})
              </span>
              {isLoadingSubstance && (
                <Icon icon="lucide:loader-2" className="ml-2 h-4 w-4 animate-spin text-white/40" size={16} />
              )}
            </h2>
            {sourcesExpanded ? (
              <Icon icon="lucide:chevron-down" className="h-5 w-5 text-white/40" size={20} />
            ) : (
              <Icon icon="lucide:chevron-right" className="h-5 w-5 text-white/40" size={20} />
            )}
          </button>
          {sourcesExpanded && (
            <>
              {(harmPotentialQuotes || pharmacologyQuotes || historyCultureQuotes) && (
                <div className="mt-4 mb-4 space-y-1">
                  {harmPotentialQuotes && (
                    <p className="text-sm text-emerald-300">
                      ✓ Extracted harm potential quotes available for this substance
                    </p>
                  )}
                  {pharmacologyQuotes && (
                    <p className="text-sm text-emerald-300">
                      ✓ Extracted pharmacology quotes available for this substance
                    </p>
                  )}
                  {historyCultureQuotes && (
                    <p className="text-sm text-emerald-300">
                      ✓ Extracted history & culture quotes available for this substance
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availableSources.map((source) => {
                  const content = getSourceContent(source.id);
                  return (
                    <div
                      key={source.id}
                      className="relative aspect-square rounded-xl border border-white/10 bg-slate-950/60"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                        <span className="truncate text-sm font-medium text-white">
                          {source.displayName}
                        </span>
                        <Button
                          variant="iconSmall"
                          onClick={() => setFullscreenSourceId(source.id)}
                          title="Open fullscreen"
                        >
                          <Icon icon="lucide:maximize-2" className="h-4 w-4" size={16} />
                        </Button>
                      </div>
                      {/* Content */}
                      <div className="absolute inset-x-0 bottom-0 top-10 overflow-auto p-3">
                        <pre className="whitespace-pre-wrap font-mono text-xs text-white/70">
                          {content ?? "Loading..."}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* Fullscreen Source Modal */}
      {fullscreenSourceId && (() => {
        const source = availableSources.find((s) => s.id === fullscreenSourceId);
        const content = source ? getSourceContent(source.id) : null;
        if (!source) return null;
        return (
          <SourcePreviewModal
            source={source}
            content={content}
            onClose={() => setFullscreenSourceId(null)}
          />
        );
      })()}

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
