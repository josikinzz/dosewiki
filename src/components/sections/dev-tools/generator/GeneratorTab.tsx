import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
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
import {
  ArrowDown01,
  ArrowDownZA,
  ArrowUp10,
  ArrowUpAZ,
  Bot,
  Check,
  Copy,
  Download,
  FileJson,
  FileText,
  FlaskConical,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
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
} from "../../../../utils/openrouter";
import {
  substances,
  loadSubstanceSources,
  type SourceInfo,
  type SubstanceModule,
} from "../../../../data/article-sources";

const STORAGE_KEYS = {
  API_KEY: "articleGenerator_apiKey",
  SELECTED_MODEL: "articleGenerator_model",
};

const PROMPT_COLLAPSED_HEIGHT = 200;

interface GeneratorTabProps {
  generatorPrompt: string;
  originalGeneratorPrompt: string;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
  promptDiff: string;
  promptHasChanges: boolean;
  onCopyPrompt: () => void;
  commitPanel?: React.ReactNode;
}

const normalizeWhitespace = (value: string) => value.replace(/\r\n/g, "\n");

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

  // Source preview state
  const [fullscreenSourceId, setFullscreenSourceId] = useState<string | null>(null);

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

  // Token estimation
  const totalTokenEstimate = useMemo(() => {
    let total = generatorPrompt.length;
    for (const sourceId of selectedSourceIds) {
      const source = availableSources.find((s) => s.id === sourceId);
      if (source) {
        total += source.size;
      }
    }
    return estimateTokens(total);
  }, [selectedSourceIds, availableSources, generatorPrompt]);

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamCompletion(
        apiKey,
        selectedModel,
        generatorPrompt,
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

  // Download JSON
  const handleDownload = useCallback(() => {
    const selectedSubstance = substances.find((s) => s.slug === selectedSubstanceSlug);
    const blob = new Blob([streamedOutput], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedSubstance?.name ?? "article"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [streamedOutput, selectedSubstanceSlug]);

  // Try to extract JSON from output
  const extractedJson = useMemo(() => {
    if (!streamedOutput) return null;
    // Try to find JSON object in output
    const match = streamedOutput.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return null;
      }
    }
    return null;
  }, [streamedOutput]);

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
                    {m.label}
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
                    ~{estimateTokens(source.size).toLocaleString()} tokens
                  </span>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="text-white/60">
              Total: ~{totalTokenEstimate.toLocaleString()} tokens
            </span>
            {totalTokenEstimate > selectedModelInfo.contextWindow * 0.8 && (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                May exceed context window
              </span>
            )}
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
            <div className="flex gap-2">
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
          <JsonEditor
            id="generated-output"
            value={extractedJson ?? streamedOutput}
            onChange={setStreamedOutput}
            minHeight={400}
          />
          {extractedJson && extractedJson !== streamedOutput && (
            <p className="mt-2 text-xs text-white/40">
              <FileJson className="mr-1 inline h-3.5 w-3.5" />
              JSON extracted and formatted from response
            </p>
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
        return createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setFullscreenSourceId(null)}
          >
            <div
              className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-gradient-to-b from-[#1a1030] via-[#130e2b] to-[#0f0a1f] shadow-2xl shadow-fuchsia-500/10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Window Title Bar */}
              <div className="flex shrink-0 items-center justify-between border-b border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Window controls (decorative) */}
                  <div className="flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-fuchsia-500/60" />
                    <div className="h-3 w-3 rounded-full bg-violet-500/60" />
                    <div className="h-3 w-3 rounded-full bg-purple-500/60" />
                  </div>
                  <span className="font-medium text-white">{source.displayName}</span>
                </div>
                <Button
                  variant="iconClose"
                  onClick={() => setFullscreenSourceId(null)}
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {/* Window Content */}
              <div className="flex-1 overflow-auto p-6">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-white/80">
                  {content ?? "Loading..."}
                </pre>
              </div>
              {/* Window Status Bar */}
              <div className="shrink-0 border-t border-fuchsia-500/20 bg-fuchsia-950/30 px-4 py-2 text-xs text-white/40">
                {content ? `${content.length.toLocaleString()} characters` : ""}
              </div>
            </div>
          </div>,
          document.body
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
          <span>~{estimateTokens(generatorPrompt.length).toLocaleString()} tokens</span>
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
          <DiffPreview markdown={promptDiff} />
        </SectionCard>
      )}
    </div>
  );
});
