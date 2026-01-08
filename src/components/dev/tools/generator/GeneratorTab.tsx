import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { SectionCard } from "../../../common/SectionCard";
import { DiffPreview } from "../../../common/DiffPreview";
import { JsonEditor } from "../../../common/JsonEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  ArrowDown01,
  ArrowDownZA,
  ArrowUp10,
  ArrowUpAZ,
  Bot,
  Check,
  CheckCircle,
  Copy,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  MODEL_OPTIONS,
  estimateTokens,
  streamCompletion,
  validateApiKey,
} from "../../../../utils/api/openrouter";
import {
  substances,
  loadSubstanceSources,
  type SourceInfo,
  type SubstanceModule,
} from "../../../../data/article-sources";
import { GeneratorOutputPreview } from "./GeneratorOutputPreview";
import { SourcePreviewModal } from "./SourcePreviewModal";
import { parseGeneratedYaml } from "./yamlParser";
import {
  STORAGE_KEYS,
  PROMPT_COLLAPSED_HEIGHT,
  stripDxmSection,
  normalizeWhitespace,
  type GeneratorTabProps,
} from "./types";
import { useDevMode } from "../../DevModeContext";
import { convertGeneratedToRawArticle } from "../../../../utils/data/articleConverter";

export const GeneratorTab = memo(function GeneratorTab({
  generatorPrompt,
  originalGeneratorPrompt,
  onPromptChange,
  onResetPrompt,
  promptDiff,
  promptHasChanges,
  onCopyPrompt,
  commitPanel,
}: GeneratorTabProps) {
  const normalizedDraft = normalizeWhitespace(generatorPrompt);
  const normalizedOriginal = normalizeWhitespace(originalGeneratorPrompt);
  const isPromptDirty = normalizedDraft !== normalizedOriginal;

  // Prompt expand/collapse state
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const togglePromptExpanded = useCallback(() => setIsPromptExpanded((prev) => !prev), []);

  // Calculate expanded height when expanding
  useEffect(() => {
    if (isPromptExpanded && promptTextareaRef.current) {
      const textarea = promptTextareaRef.current;
      // Temporarily set height to auto to measure scrollHeight
      const originalHeight = textarea.style.height;
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = originalHeight;
      setExpandedHeight(scrollHeight);
    }
  }, [isPromptExpanded, generatorPrompt]);

  const handlePromptInput = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onPromptChange(e.target.value);
    },
    [onPromptChange]
  );

  const handleDownloadPrompt = useCallback(() => {
    const blob = new Blob([generatorPrompt], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "PROMPT.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [generatorPrompt]);

  // API state
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEYS.API_KEY) || "";
    }
    return "";
  });
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
  const [selectedSubstanceSlug, setSelectedSubstanceSlug] = useState<string | null>(null);
  const [substanceModule, setSubstanceModule] = useState<SubstanceModule | null>(null);
  const [isLoadingSubstance, setIsLoadingSubstance] = useState(false);

  // Source selection state
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Output view mode (yaml or preview)
  const [outputViewMode, setOutputViewMode] = useState<"yaml" | "preview">("yaml");

  // Source preview state
  const [fullscreenSourceId, setFullscreenSourceId] = useState<string | null>(null);

  // Save to database state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // DevMode context for saving articles
  const { articles, applyArticlesTransform } = useDevMode();

  // Persist API key and model
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
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
    let filtered = query
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
  }, [searchQuery, sortOrder]);

  // Get available sources for selected substance
  const availableSources = useMemo<SourceInfo[]>(() => {
    if (!selectedSubstanceSlug) return [];
    const substance = substances.find((s) => s.slug === selectedSubstanceSlug);
    return substance?.sources ?? [];
  }, [selectedSubstanceSlug]);

  // Token estimation using precalculated tokens from build
  const totalTokenEstimate = useMemo(() => {
    let total = estimateTokens(generatorPrompt);
    for (const sourceId of selectedSourceIds) {
      const source = availableSources.find((s) => s.id === sourceId);
      if (source) {
        total += source.tokens;
      }
    }
    return total;
  }, [selectedSourceIds, availableSources, generatorPrompt]);

  const selectedModelInfo = useMemo(
    () => MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0],
    [selectedModel]
  );

  const contextUsagePercent = useMemo(() => {
    return Math.min((totalTokenEstimate / selectedModelInfo.contextWindow) * 100, 100);
  }, [totalTokenEstimate, selectedModelInfo.contextWindow]);

  // Check if selected substance is DXM (for conditional prompt inclusion)
  const isDxm = useMemo(() => {
    if (!selectedSubstanceSlug) return false;
    const slug = selectedSubstanceSlug.toLowerCase();
    return slug === "dxm" || slug === "dextromethorphan";
  }, [selectedSubstanceSlug]);

  // Load substance module when selection changes
  useEffect(() => {
    if (!selectedSubstanceSlug) {
      setSubstanceModule(null);
      return;
    }

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

  // Reset sources when substance changes
  useEffect(() => {
    setSelectedSourceIds(new Set());
    setFullscreenSourceId(null);
  }, [selectedSubstanceSlug]);

  // Toggle source selection
  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }, []);

  // Toggle all sources
  const toggleSelectAll = useCallback(() => {
    if (selectedSourceIds.size === availableSources.length) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(availableSources.map((s) => s.id)));
    }
  }, [availableSources, selectedSourceIds.size]);


  // Get content for a source
  const getSourceContent = useCallback(
    (sourceId: string): string | null => {
      if (!substanceModule) return null;
      return substanceModule.contents[sourceId] ?? null;
    },
    [substanceModule]
  );

  // Generate article
  const handleGenerate = useCallback(async () => {
    if (!apiKey || !substanceModule || selectedSourceIds.size === 0) {
      return;
    }

    setIsGenerating(true);
    setStreamedOutput("");
    setGenerationError(null);

    // Collect all selected source contents
    const loadedSources: { source: string; content: string }[] = [];
    for (const sourceId of selectedSourceIds) {
      const source = availableSources.find((s) => s.id === sourceId);
      if (!source) continue;

      const content = substanceModule.contents[sourceId];
      if (content) {
        loadedSources.push({ source: source.displayName, content });
      }
    }

    if (loadedSources.length === 0) {
      setGenerationError("Failed to load source content");
      setIsGenerating(false);
      return;
    }

    // Assemble user message
    const userMessage = loadedSources
      .map(({ source, content }) => `## Source: ${source}\n\n${content}`)
      .join("\n\n---\n\n");

    // Strip DXM-specific section if not generating for DXM
    const effectivePrompt = isDxm ? generatorPrompt : stripDxmSection(generatorPrompt);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamCompletion(
        apiKey,
        selectedModel,
        effectivePrompt,
        userMessage,
        {
          onChunk: (chunk) => {
            setStreamedOutput((prev) => prev + chunk);
          },
          onComplete: () => {
            setIsGenerating(false);
          },
          onError: (error) => {
            setGenerationError(error.message);
            setIsGenerating(false);
          },
        },
        controller.signal
      );
    } catch (error) {
      if (error instanceof Error) {
        setGenerationError(error.message);
      }
      setIsGenerating(false);
    }
  }, [
    apiKey,
    substanceModule,
    selectedSourceIds,
    selectedModel,
    availableSources,
    generatorPrompt,
    isDxm,
  ]);

  // Cancel generation
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, []);

  // Copy to clipboard
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(streamedOutput);
  }, [streamedOutput]);

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

  // Save to database
  const handleSaveToDatabase = useCallback(() => {
    if (!streamedOutput || isGenerating) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const parseResult = parseGeneratedYaml(streamedOutput);
      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error ?? "Failed to parse YAML");
      }

      // Find next available ID
      const maxId = articles.reduce((max, a) => Math.max(max, typeof a.id === "number" ? a.id : 0), 0);
      const newId = maxId + 1;

      // Convert and add
      const rawArticle = convertGeneratedToRawArticle(parseResult.data, newId);
      applyArticlesTransform((prev) => [...prev, rawArticle]);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [streamedOutput, isGenerating, articles, applyArticlesTransform]);

  const selectedSubstance = useMemo(
    () => substances.find((s) => s.slug === selectedSubstanceSlug),
    [selectedSubstanceSlug]
  );

  const canGenerate = apiKey && isKeyValid && substanceModule && selectedSourceIds.size > 0;

  return (
    <div className="mt-6 space-y-6">
      {/* API Configuration */}
      <SectionCard delay={0.1}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Bot className="h-5 w-5 text-fuchsia-300" />
          API Configuration
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">
              OpenRouter API Key
            </label>
            <div className="relative">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                className="pr-10"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isValidatingKey ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                ) : isKeyValid === true ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : isKeyValid === false ? (
                  <X className="h-4 w-4 text-red-400" />
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
            <label className="mb-1.5 block text-sm font-medium text-white/70">
              Model
            </label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
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
          <FlaskConical className="h-5 w-5 text-fuchsia-300" />
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
              <ArrowUp10 className="h-5 w-5" />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("sources-asc")}
              title="Sort by sources (ascending)"
              data-active={sortOrder === "sources-asc"}
            >
              <ArrowDown01 className="h-5 w-5" />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("alpha-asc")}
              title="Sort alphabetically (A-Z)"
              data-active={sortOrder === "alpha-asc"}
            >
              <ArrowUpAZ className="h-5 w-5" />
            </Button>
            <Button
              variant="sortIcon"
              onClick={() => setSortOrder("alpha-desc")}
              title="Sort alphabetically (Z-A)"
              data-active={sortOrder === "alpha-desc"}
            >
              <ArrowDownZA className="h-5 w-5" />
            </Button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
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

      {/* Source Selection */}
      {selectedSubstanceSlug && availableSources.length > 0 && (
        <SectionCard delay={0.2}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Select Sources
              {isLoadingSubstance && (
                <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-white/40" />
              )}
            </h2>
            <Button
              variant="textLink"
              onClick={toggleSelectAll}
            >
              {selectedSourceIds.size === availableSources.length
                ? "Deselect All"
                : "Select All"}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {availableSources.map((source) => (
              <label
                key={source.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                  selectedSourceIds.has(source.id)
                    ? "border-fuchsia-500/50 bg-fuchsia-500/10"
                    : "border-white/10 bg-slate-950/40 hover:border-white/20"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedSourceIds.has(source.id)}
                  onChange={() => toggleSource(source.id)}
                  className="h-4 w-4 rounded border-white/20 bg-slate-950 text-fuchsia-500 focus:ring-fuchsia-400"
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">
                    {source.displayName}
                  </span>
                  <span className="block text-xs text-white/40">
                    {source.tokens.toLocaleString()} tokens
                  </span>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all duration-300 ${
                  contextUsagePercent >= 80
                    ? "bg-red-500"
                    : contextUsagePercent >= 60
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${contextUsagePercent}%` }}
              />
            </div>
            {/* Labels */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 text-white/60">
                <span>
                  ~{totalTokenEstimate.toLocaleString()} / {selectedModelInfo.contextWindow.toLocaleString()} tokens
                </span>
                {selectedSubstanceSlug && (
                  <span className={isDxm ? "text-fuchsia-300" : "text-white/40"}>
                    {isDxm ? "DXM plateau dosing included" : "DXM plateau dosing excluded"}
                  </span>
                )}
              </div>
              <span className={`font-medium ${
                contextUsagePercent >= 80
                  ? "text-red-400"
                  : contextUsagePercent >= 60
                  ? "text-amber-400"
                  : "text-white/60"
              }`}>
                {contextUsagePercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Generate Button */}
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-white/10 pt-6">
            <Button
              variant={isGenerating ? "generateCancel" : "generatePrimary"}
              onClick={isGenerating ? handleCancel : handleGenerate}
              disabled={!canGenerate && !isGenerating}
            >
              {isGenerating ? (
                <>
                  <X className="h-4 w-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Article
                </>
              )}
            </Button>
            {isGenerating && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            )}
            {generationError && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {generationError}
              </div>
            )}
            {!canGenerate && !isGenerating && selectedSourceIds.size === 0 && (
              <p className="text-sm text-white/40">
                Select at least one source to generate
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {/* Output */}
      {streamedOutput && (
        <SectionCard delay={0.25}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Generated Output</h2>
            <div className="flex items-center gap-3">
              <Tabs
                value={outputViewMode}
                onValueChange={(v) => setOutputViewMode(v as "yaml" | "preview")}
              >
                <TabsList>
                  <TabsTrigger value="yaml">YAML</TabsTrigger>
                  <TabsTrigger value="preview" disabled={isGenerating}>
                    Preview
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex gap-2">
                <Button
                  variant="glass"
                  size="pill"
                  onClick={handleSaveToDatabase}
                  disabled={isGenerating || isSaving || !streamedOutput}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : saveSuccess ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {saveSuccess ? "Saved!" : "Save to Database"}
                </Button>
                <Button
                  variant="glass"
                  size="pill"
                  onClick={handleCopy}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
                <Button
                  variant="glass"
                  size="pill"
                  onClick={handleDownload}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          </div>
          {saveError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {saveError}
            </div>
          )}
          {outputViewMode === "yaml" ? (
            <JsonEditor
              id="generated-output"
              value={streamedOutput}
              onChange={setStreamedOutput}
              minHeight={400}
            />
          ) : (
            <GeneratorOutputPreview yamlContent={streamedOutput} />
          )}
        </SectionCard>
      )}

      {/* Source Previews */}
      {substanceModule && selectedSourceIds.size > 0 && (
        <SectionCard delay={0.3}>
          <h2 className="mb-4 text-lg font-semibold text-white">Source Articles</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableSources
              .filter((s) => selectedSourceIds.has(s.id))
              .map((source) => {
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
                        <Maximize2 className="h-4 w-4" />
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

      {/* Prompt Editor Section */}
      <SectionCard delay={0.35}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <FileText className="h-5 w-5 text-fuchsia-300" />
            System Prompt
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="iconAction"
              onClick={togglePromptExpanded}
              title={isPromptExpanded ? "Collapse" : "Expand"}
            >
              {isPromptExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            {isPromptDirty && (
              <Button
                variant="iconWarning"
                onClick={onResetPrompt}
                title="Reset"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="iconAction"
              onClick={onCopyPrompt}
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="iconAction"
              onClick={handleDownloadPrompt}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Textarea
          ref={promptTextareaRef}
          value={generatorPrompt}
          onChange={handlePromptInput}
          style={{ height: isPromptExpanded && expandedHeight ? expandedHeight : PROMPT_COLLAPSED_HEIGHT }}
          className={`resize-none font-mono text-sm ${isPromptExpanded ? 'overflow-y-hidden' : 'overflow-y-auto'}`}
          spellCheck={false}
        />
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-white/40">
          <span>{generatorPrompt.length.toLocaleString()} characters</span>
          <span>~{estimateTokens(generatorPrompt).toLocaleString()} tokens</span>
          {isPromptDirty && (
            <span className="text-amber-300">Unsaved changes</span>
          )}
        </div>

        {/* Commit Panel */}
        {commitPanel && (
          <div className="mt-6 border-t border-white/10 pt-6">
            {commitPanel}
          </div>
        )}
      </SectionCard>

      {/* Prompt Diff */}
      {promptHasChanges && (
        <SectionCard delay={0.4}>
          <h3 className="mb-3 text-sm font-medium text-white/70">Prompt Changes</h3>
          <DiffPreview diffText={promptDiff} />
        </SectionCard>
      )}
    </div>
  );
});
