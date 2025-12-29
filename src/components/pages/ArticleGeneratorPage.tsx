import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "../common/SectionCard";
import { JsonEditor } from "../common/JsonEditor";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileJson,
  Loader2,
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
} from "../../utils/openrouter";
import {
  substances,
  loadSubstanceSources,
  type SourceInfo,
  type SubstanceModule,
} from "../../data/article-sources";
import { systemPrompt } from "../../data/article-sources/prompt";

const STORAGE_KEYS = {
  API_KEY: "articleGenerator_apiKey",
  SELECTED_MODEL: "articleGenerator_model",
};

export function ArticleGeneratorPage() {
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
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(new Set());

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

  // Filter substances by search
  const filteredSubstances = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return substances;
    return substances.filter((s) =>
      s.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Get available sources for selected substance
  const availableSources = useMemo<SourceInfo[]>(() => {
    if (!selectedSubstanceSlug) return [];
    const substance = substances.find((s) => s.slug === selectedSubstanceSlug);
    return substance?.sources ?? [];
  }, [selectedSubstanceSlug]);

  // Token estimation
  const totalTokenEstimate = useMemo(() => {
    let total = systemPrompt.length;
    for (const sourceId of selectedSourceIds) {
      const source = availableSources.find((s) => s.id === sourceId);
      if (source) {
        total += source.size;
      }
    }
    return estimateTokens(total);
  }, [selectedSourceIds, availableSources]);

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
    setExpandedPreviews(new Set());
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

  // Toggle preview expansion
  const togglePreview = useCallback((sourceId: string) => {
    setExpandedPreviews((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }, []);

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
        systemPrompt,
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
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          Article Generator
        </h1>
        <p className="mt-2 text-base text-white/60">
          Generate structured drug articles from source materials using AI
        </p>
      </header>

      <div className="space-y-6">
        {/* API Configuration */}
        <SectionCard delay={0}>
          <h2 className="mb-4 text-lg font-semibold text-white">API Configuration</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">
                OpenRouter API Key
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 pr-10 text-[16px] text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:outline-none focus:ring-1 focus:ring-fuchsia-300"
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
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-[16px] text-white focus:border-fuchsia-400 focus:outline-none focus:ring-1 focus:ring-fuchsia-300"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-white/40">
                Context window: {selectedModelInfo.contextWindow.toLocaleString()} tokens
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Substance Selection */}
        <SectionCard delay={0.05}>
          <h2 className="mb-4 text-lg font-semibold text-white">Select Substance</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search substances..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-2.5 pl-10 pr-4 text-[16px] text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:outline-none focus:ring-1 focus:ring-fuchsia-300"
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40">
            {filteredSubstances.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/40">
                No substances found
              </div>
            ) : (
              filteredSubstances.map((substance) => (
                <button
                  key={substance.slug}
                  onClick={() => setSelectedSubstanceSlug(substance.slug)}
                  className={`w-full border-b border-white/5 px-4 py-2.5 text-left transition last:border-0 hover:bg-white/5 ${
                    selectedSubstanceSlug === substance.slug
                      ? "bg-fuchsia-500/20 text-fuchsia-200"
                      : "text-white/80"
                  }`}
                >
                  <span className="font-medium">{substance.name}</span>
                  <span className="ml-2 text-xs text-white/40">
                    ({substance.sources.length} sources)
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="mt-2 text-xs text-white/40">
            {substances.length} substances available
          </p>
        </SectionCard>

        {/* Source Selection */}
        {selectedSubstanceSlug && availableSources.length > 0 && (
          <SectionCard delay={0.1}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Select Sources
                {isLoadingSubstance && (
                  <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-white/40" />
                )}
              </h2>
              <button
                onClick={toggleSelectAll}
                className="text-sm text-fuchsia-300 hover:text-fuchsia-200"
              >
                {selectedSourceIds.size === availableSources.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
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
              <button
                onClick={isGenerating ? handleCancel : handleGenerate}
                disabled={!canGenerate && !isGenerating}
                className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 font-medium transition ${
                  isGenerating
                    ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                    : canGenerate
                    ? "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-lg shadow-fuchsia-500/25 hover:shadow-fuchsia-500/40"
                    : "cursor-not-allowed bg-white/10 text-white/40"
                }`}
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
              </button>
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
          <SectionCard delay={0.2}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Generated Output</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
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
          <SectionCard delay={0.25}>
            <h2 className="mb-4 text-lg font-semibold text-white">Source Articles</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {availableSources
                .filter((s) => selectedSourceIds.has(s.id))
                .map((source) => {
                  const content = getSourceContent(source.id);
                  return (
                    <div
                      key={source.id}
                      className="rounded-xl border border-white/10 bg-slate-950/60"
                    >
                      <button
                        onClick={() => togglePreview(source.id)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="font-medium text-white">{source.displayName}</span>
                        <div className="flex items-center gap-2">
                          {expandedPreviews.has(source.id) ? (
                            <ChevronUp className="h-4 w-4 text-white/40" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-white/40" />
                          )}
                        </div>
                      </button>
                      {expandedPreviews.has(source.id) && content && (
                        <div className="border-t border-white/5 px-4 pb-4">
                          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-xs text-white/70">
                            {content}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </SectionCard>
        )}

        {/* System Prompt */}
        <SectionCard delay={0.3}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">System Prompt</h2>
            <div className="flex gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(systemPrompt)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([systemPrompt], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "PROMPT.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs text-white/70">
            {systemPrompt}
          </pre>
          <p className="mt-2 text-xs text-white/40">
            {systemPrompt.length.toLocaleString()} characters (~{estimateTokens(systemPrompt.length).toLocaleString()} tokens)
          </p>
        </SectionCard>
      </div>
    </main>
  );
}
