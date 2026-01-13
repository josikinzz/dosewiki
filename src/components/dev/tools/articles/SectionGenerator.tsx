/**
 * SectionGenerator - Reusable component for AI-assisted section generation.
 * 
 * Provides a collapsible panel with:
 * - Generate button
 * - Streaming YAML output preview
 * - Apply/Discard buttons
 */

import { memo, useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
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
import type { LucideIcon } from "lucide-react";

type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

const REASONING_OPTIONS: { value: ReasoningEffort; label: string; description: string }[] = [
  { value: "minimal", label: "Minimal", description: "5% tokens" },
  { value: "low", label: "Low", description: "20% tokens" },
  { value: "medium", label: "Medium", description: "50% tokens" },
  { value: "high", label: "High", description: "80% tokens" },
  { value: "xhigh", label: "Maximum", description: "95% tokens" },
];

export interface SectionGeneratorProps {
  /** Section key for identification */
  sectionKey: string;
  /** Display label for the section */
  sectionLabel: string;
  /** Icon component to display */
  icon: LucideIcon;
  /** The section-specific system prompt */
  prompt: string;
  /** Pre-extracted source content for this section (e.g., harm potential quotes) */
  extractedContent: string | null;
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
}

export const SectionGenerator = memo(function SectionGenerator({
  sectionKey,
  sectionLabel,
  icon: Icon,
  prompt,
  extractedContent,
  genericSources,
  currentArticleYaml,
  onApply,
  apiKey,
  model,
  isKeyValid,
}: SectionGeneratorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [streamedReasoning, setStreamedReasoning] = useState("");
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Check if current model supports reasoning
  const supportsReasoning = model.includes("claude");

  // Determine if we can generate
  const hasContent = extractedContent || genericSources.length > 0;
  const canGenerate = apiKey && isKeyValid && hasContent;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    console.log("[SectionGenerator] handleGenerate called for:", sectionKey);
    console.log("  - extractedContent (first 100 chars):", extractedContent?.slice(0, 100));
    console.log("  - currentArticleYaml title:", currentArticleYaml?.match(/title: (.+)/)?.[1]);
    console.log("  - genericSources count:", genericSources.length);

    setIsGenerating(true);
    setStreamedOutput("");
    setStreamedReasoning("");
    setError(null);
    setHasGenerated(true);

    // Build user message from available content
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
    } else {
      // Use full source articles
      const sourcesText = genericSources
        .map(({ source, content }) => `## Source: ${source}\n\n${content}`)
        .join("\n\n---\n\n");
      messageParts.push(sourcesText);
    }

    const userMessage = messageParts.join("\n\n---\n\n");

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
  }, [apiKey, model, prompt, extractedContent, genericSources, currentArticleYaml, sectionLabel, canGenerate, supportsReasoning, reasoningEffort]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const handleApply = useCallback(() => {
    if (streamedOutput) {
      onApply(streamedOutput);
      setStreamedOutput("");
      setHasGenerated(false);
      setIsExpanded(false);
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

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-slate-950/40">
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-white/40" />
          ) : (
            <ChevronRight className="h-4 w-4 text-white/40" />
          )}
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <span className="text-sm font-medium text-white/70">
            AI Generate {sectionLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {extractedContent && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
              Extracted sources available
            </span>
          )}
          {isGenerating && (
            <Loader2 className="h-4 w-4 animate-spin text-fuchsia-300" />
          )}
          {hasGenerated && streamedOutput && !isGenerating && (
            <Check className="h-4 w-4 text-emerald-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/10 px-4 py-4 space-y-4">
          {/* Reasoning selector and Generate button */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Reasoning effort selector - only for Claude models */}
            {supportsReasoning && !isGenerating && (
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-fuchsia-300" />
                <Select
                  value={reasoningEffort}
                  onValueChange={(v) => setReasoningEffort(v as ReasoningEffort)}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs [&>span]:flex-1 [&>span]:text-left">
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

            {isGenerating && (
              <span className="text-xs text-white/50">
                Generating {sectionLabel.toLowerCase()}...
              </span>
            )}

            {!canGenerate && !isGenerating && (
              <span className="text-xs text-white/40">
                {!apiKey || !isKeyValid
                  ? "Configure API key first"
                  : "No source content available"}
              </span>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>

          {/* Reasoning box - collapsible */}
          {(streamedReasoning || (isGenerating && hasGenerated)) && (
            <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/20">
              <button
                type="button"
                onClick={toggleReasoningExpanded}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-fuchsia-500/5 transition-colors"
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
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50">
                  Generated YAML
                </label>
                <Textarea
                  value={streamedOutput}
                  onChange={(e) => setStreamedOutput(e.target.value)}
                  className="min-h-[200px] font-mono text-xs resize-y"
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

          {/* Source info */}
          <div className="text-xs text-white/40">
            {extractedContent ? (
              <span>
                Using pre-extracted {sectionKey.replace(/_/g, " ")} content
              </span>
            ) : genericSources.length > 0 ? (
              <span>
                Using {genericSources.length} full source article{genericSources.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span>No source content available for this substance</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
