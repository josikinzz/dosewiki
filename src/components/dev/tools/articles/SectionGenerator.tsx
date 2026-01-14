/**
 * SectionGenerator - Reusable component for AI-assisted section generation.
 * 
 * Provides an inline generate button that expands to show:
 * - Streaming reasoning (collapsible)
 * - Streaming YAML output preview
 * - Apply/Discard buttons
 */

import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { streamCompletion, type StreamCompletionOptions } from "../../../../utils/api/openrouter";
import type { ExtractedSourceInfo } from "../../../../utils/sectionSources";
import { PromptPreviewModal } from "./PromptPreviewModal";

type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

const REASONING_OPTIONS: { value: ReasoningEffort; label: string; description: string }[] = [
  { value: "minimal", label: "Minimal", description: "5% tokens" },
  { value: "low", label: "Low", description: "20% tokens" },
  { value: "medium", label: "Medium", description: "50% tokens" },
  { value: "high", label: "High", description: "80% tokens" },
  { value: "xhigh", label: "Maximum", description: "95% tokens" },
];

export interface SectionGeneratorProps {
  /** Display label for the section */
  sectionLabel: string;
  /** The section-specific system prompt */
  prompt: string;
  /** Pre-extracted source content for this section (e.g., harm potential quotes) */
  extractedContent: string | null;
  /** Parsed source info with favicons (optional, enhances display) */
  extractedSources?: ExtractedSourceInfo | null;
  /** Full source articles as fallback when no extracted content */
  genericSources: Array<{ source: string; content: string }>;
  /** Current article YAML to show the model what's already filled in */
  currentArticleYaml: string | null;
  /** Callback when user clicks Apply with generated YAML */
  onApply: (sectionYaml: string) => void;
  /** OpenRouter API key */
  apiKey: string;
  /** Selected model ID */
  model: string;
  /** Whether API key is valid */
  isKeyValid: boolean | null;
  /** Whether the generator is disabled (greyed out) */
  disabled?: boolean;
  /** Message to show when disabled */
  disabledMessage?: string;
}

export const SectionGenerator = memo(function SectionGenerator({
  sectionLabel,
  prompt,
  extractedContent,
  extractedSources,
  genericSources,
  currentArticleYaml,
  onApply,
  apiKey,
  model,
  isKeyValid,
  disabled = false,
  disabledMessage,
}: SectionGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [streamedReasoning, setStreamedReasoning] = useState("");
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Check if current model supports reasoning
  const supportsReasoning = model.includes("claude");

  // Determine if we can generate
  const hasContent = extractedContent || genericSources.length > 0;
  const canGenerate = apiKey && isKeyValid && hasContent;
  
  // Show expanded content when generation has started
  const showOutput = hasGenerated || isGenerating;

  // Build user message for prompt preview and generation
  const userMessage = useMemo(() => {
    const messageParts: string[] = [];

    // Include current article YAML so the model knows what's already filled in
    if (currentArticleYaml) {
      messageParts.push(
        `## Current Article State\n\nBelow is the current state of the article. Use this to understand what information already exists in other sections. Do NOT duplicate information that belongs in other sections.\n\n\`\`\`yaml\n${currentArticleYaml}\n\`\`\``
      );
    }

    // Add source content
    if (extractedContent) {
      // Use pre-extracted section-specific content
      messageParts.push(`## Extracted Source Content for ${sectionLabel}\n\n${extractedContent}`);
    } else if (genericSources.length > 0) {
      // Use full source articles
      const sourcesText = genericSources
        .map(({ source, content }) => `## Source: ${source}\n\n${content}`)
        .join("\n\n---\n\n");
      messageParts.push(sourcesText);
    }

    return messageParts.join("\n\n---\n\n");
  }, [currentArticleYaml, extractedContent, genericSources, sectionLabel]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setStreamedOutput("");
    setStreamedReasoning("");
    setError(null);
    setHasGenerated(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Build options with reasoning settings
    const options: StreamCompletionOptions = {
      enableReasoning: supportsReasoning,
      reasoningEffort: reasoningEffort,
    };

    try {
      await streamCompletion(
        apiKey,
        model,
        prompt,
        userMessage,
        {
          onChunk: (chunk) => {
            setStreamedOutput((prev) => prev + chunk);
          },
          onReasoning: (chunk) => {
            setStreamedReasoning((prev) => prev + chunk);
          },
          onComplete: () => {
            setIsGenerating(false);
          },
          onError: (err) => {
            setError(err.message);
            setIsGenerating(false);
          },
        },
        controller.signal,
        options
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
      setIsGenerating(false);
    }
  }, [apiKey, model, prompt, userMessage, canGenerate, supportsReasoning, reasoningEffort]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const handleApply = useCallback(() => {
    if (streamedOutput) {
      onApply(streamedOutput);
      setStreamedOutput("");
      setStreamedReasoning("");
      setHasGenerated(false);
    }
  }, [streamedOutput, onApply]);

  const handleDiscard = useCallback(() => {
    setStreamedOutput("");
    setStreamedReasoning("");
    setHasGenerated(false);
    setError(null);
  }, []);

  const toggleReasoningExpanded = useCallback(() => {
    setIsReasoningExpanded((prev) => !prev);
  }, []);

  return (
    <div className={`mb-4 rounded-xl border border-white/10 bg-slate-950/40 ${disabled ? "opacity-50" : ""}`}>
      {/* Header row - always visible with inline controls */}
      <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${disabled ? "cursor-not-allowed" : ""}`}>
        {/* Left side: icon and badges */}
        <div className="flex items-center gap-2 mr-auto">
          <Bot className={`h-5 w-5 ${disabled ? "text-white/30" : "text-fuchsia-300"}`} />
          {disabled && disabledMessage && (
            <span className="text-xs text-white/30">{disabledMessage}</span>
          )}
          {!disabled && extractedSources && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-emerald-300">
                {extractedSources.count} source{extractedSources.count !== 1 ? "s" : ""}
              </span>
              {extractedSources.sources.some(s => s.favicon) && (
                <div className="flex gap-1">
                  {extractedSources.sources
                    .filter(s => s.favicon)
                    .slice(0, 6)
                    .map((source, i) => (
                      <img
                        key={i}
                        src={source.favicon!}
                        alt={source.name}
                        title={source.name}
                        className="h-5 w-5 rounded-full border border-slate-800 bg-slate-900"
                      />
                    ))}
                </div>
              )}
            </div>
          )}
          {!disabled && !extractedSources && extractedContent && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
              Sources ready
            </span>
          )}
          {!disabled && !extractedContent && genericSources.length > 0 && (
            <span className="text-xs text-white/40">
              {genericSources.length} source{genericSources.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Prompt preview badge */}
          {!disabled && hasContent && (
            <button
              type="button"
              onClick={() => setIsPromptModalOpen(true)}
              className="flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/30 transition-colors"
            >
              <FileCode className="h-3.5 w-3.5" />
              Prompt
            </button>
          )}
        </div>

        {/* Right side: controls */}
        {!disabled && (
          <div className="flex items-center gap-2">
            {/* Reasoning effort selector - only for Claude models, hidden during generation */}
            {supportsReasoning && !isGenerating && (
              <div className="flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-fuchsia-300" />
                <Select
                  value={reasoningEffort}
                  onValueChange={(v) => setReasoningEffort(v as ReasoningEffort)}
                >
                  <SelectTrigger className="h-7 w-28" selectSize="compact">
                    <SelectValue>
                      {REASONING_OPTIONS.find(o => o.value === reasoningEffort)?.label ?? "Medium"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {REASONING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-3">
                          <span>{opt.label}</span>
                          <span className="text-xs text-white/40">{opt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              variant={isGenerating ? "generateCancel" : "generatePrimary"}
              size="sm"
              onClick={isGenerating ? handleCancel : handleGenerate}
              disabled={!canGenerate && !isGenerating}
              className="h-7"
            >
              {isGenerating ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate
                </>
              )}
            </Button>

            {/* Status indicators */}
            {isGenerating && (
              <Loader2 className="h-4 w-4 animate-spin text-fuchsia-300" />
            )}
            {hasGenerated && streamedOutput && !isGenerating && (
              <Check className="h-4 w-4 text-emerald-400" />
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 w-full mt-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {/* Cannot generate message */}
        {!disabled && !canGenerate && !isGenerating && !error && (
          <span className="text-xs text-white/40">
            {!apiKey || !isKeyValid
              ? "Configure API key first"
              : "No source content available"}
          </span>
        )}
      </div>

      {/* Output area - only shown after generation starts */}
      {showOutput && !disabled && (
        <div className="border-t border-white/10 px-4 py-3 space-y-3">
          {/* Reasoning box - collapsible */}
          {(streamedReasoning || (isGenerating && !streamedOutput)) && (
            <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/20">
              <button
                type="button"
                onClick={toggleReasoningExpanded}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-fuchsia-500/5 transition-colors rounded-lg"
              >
                {isReasoningExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-fuchsia-300" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-fuchsia-300" />
                )}
                <Brain className="h-3.5 w-3.5 text-fuchsia-300" />
                <span className="text-xs font-medium text-fuchsia-300">
                  Reasoning
                </span>
                {isGenerating && !streamedOutput && (
                  <Loader2 className="ml-1 h-3 w-3 animate-spin text-fuchsia-300" />
                )}
              </button>
              {isReasoningExpanded && (
                <div className="border-t border-fuchsia-500/20 px-3 py-2">
                  <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono text-xs text-fuchsia-200/70">
                    {streamedReasoning || "Thinking..."}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Output area */}
          {(streamedOutput || hasGenerated) && (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-white/50">
                  Generated YAML
                </label>
                <Textarea
                  value={streamedOutput}
                  onChange={(e) => setStreamedOutput(e.target.value)}
                  className="min-h-[180px] font-mono text-xs resize-y"
                  placeholder="Generated YAML will appear here..."
                />
              </div>

              {/* Apply/Discard buttons */}
              {streamedOutput && !isGenerating && (
                <div className="flex gap-2">
                  <Button
                    variant="glass"
                    size="pill"
                    onClick={handleApply}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Apply to Form
                  </Button>
                  <Button
                    variant="ghost"
                    size="pill"
                    onClick={handleDiscard}
                  >
                    <X className="h-3.5 w-3.5" />
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prompt Preview Modal */}
      {isPromptModalOpen && (
        <PromptPreviewModal
          systemPrompt={prompt}
          userMessage={userMessage}
          onClose={() => setIsPromptModalOpen(false)}
        />
      )}
    </div>
  );
});
