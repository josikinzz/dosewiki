/**
 * SectionGenerator - Reusable component for AI-assisted section generation.
 * 
 * Provides an inline generate button that expands to show:
 * - Streaming reasoning (collapsible)
 * - Streaming YAML output preview
 * - Apply/Discard buttons
 */

import { memo, useCallback, useId, useMemo, useRef, useState } from "react";
import yaml from "yaml";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamCompletion, type StreamCompletionOptions } from "@/utils/api/openrouter";
import type { ExtractedSourceInfo } from "@/utils/sectionSources";
import { PromptEditorModal } from "./PromptEditorModal";
import type { SectionKey } from "@/data/config/sectionPrompts";
import type { QuoteSection } from "@/hooks/useQuotes";

type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
type GenerationMode = "fresh_slate" | "review";

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
  /** The section key for identifying the prompt (e.g., "harm_potential") */
  sectionKey: SectionKey;
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
  /** Optional note to display next to Apply button (e.g., explaining where data goes) */
  applyNote?: string;
  /** Substance slug for quote editing (optional) */
  substanceSlug?: string | null;
  /** Quote section type for editing (optional) */
  quoteSection?: QuoteSection;
  /** Username for attribution when saving */
  username?: string;
}

export const SectionGenerator = memo(function SectionGenerator({
  sectionLabel,
  sectionKey,
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
  applyNote,
  substanceSlug,
  quoteSection,
  username,
}: SectionGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [streamedReasoning, setStreamedReasoning] = useState("");
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("low");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fresh_slate");
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const outputId = useId();
  
  // Check if current model supports reasoning
  const supportsReasoning = model.includes("claude");

  // Check if current section has content (for disabling Review mode)
  const sectionHasContent = useMemo(() => {
    if (!currentArticleYaml) return false;
    try {
      const parsed = yaml.parse(currentArticleYaml);

      // Helper to check if an object has non-empty values
      const hasNonEmptyValues = (obj: unknown): boolean => {
        if (!obj || typeof obj !== 'object') return false;
        return Object.values(obj).some(v =>
          v !== null && v !== undefined && v !== '' &&
          !(Array.isArray(v) && v.length === 0) &&
          !(typeof v === 'object' && !hasNonEmptyValues(v))
        );
      };

      // Handle dosage_duration which maps to separate dosage and duration keys
      if (sectionKey === 'dosage_duration') {
        return hasNonEmptyValues(parsed.dosage) || hasNonEmptyValues(parsed.duration);
      }

      const sectionData = parsed[sectionKey];
      if (!sectionData) return false;
      return hasNonEmptyValues(sectionData);
    } catch {
      return false;
    }
  }, [currentArticleYaml, sectionKey]);

  // Filter out target section from YAML (for Fresh Slate mode)
  const getFilteredArticleYaml = useCallback((fullYaml: string): string => {
    try {
      const parsed = yaml.parse(fullYaml);
      // Handle dosage_duration which maps to separate dosage and duration keys
      if (sectionKey === 'dosage_duration') {
        delete parsed.dosage;
        delete parsed.duration;
      } else {
        delete parsed[sectionKey];
      }
      return yaml.stringify(parsed, { lineWidth: 0, nullStr: "" });
    } catch {
      return fullYaml;
    }
  }, [sectionKey]);

  // Determine if we can generate
  const hasContent = extractedContent || genericSources.length > 0;
  const canGenerate = apiKey && isKeyValid && hasContent;
  
  // Show expanded content when generation has started
  const showOutput = hasGenerated || isGenerating;

  // Build user message for prompt preview and generation
  const userMessage = useMemo(() => {
    const messageParts: string[] = [];

    if (currentArticleYaml) {
      if (generationMode === 'fresh_slate') {
        // Fresh Slate: exclude target section, provide other sections for context
        const filteredYaml = getFilteredArticleYaml(currentArticleYaml);
        messageParts.push(
          `## Current Article Context\n\nBelow is the current state of OTHER sections in the article (the ${sectionLabel} section is excluded). Use this to understand what exists elsewhere and avoid duplication. Generate the ${sectionLabel} section from scratch based on the provided sources.\n\n\`\`\`yaml\n${filteredYaml}\n\`\`\``
        );
      } else {
        // Review: include full article with review instructions
        messageParts.push(
          `## Current Article State (Review Mode)\n\nBelow is the current article including the existing ${sectionLabel} section. Review the existing ${sectionLabel} content and improve it where applicable:\n- Enhance clarity and readability\n- Add any missing information from sources\n- Correct any inaccuracies\n- Preserve accurate content that doesn't need changes\n\n\`\`\`yaml\n${currentArticleYaml}\n\`\`\``
        );
      }
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
  }, [currentArticleYaml, generationMode, getFilteredArticleYaml, extractedContent, genericSources, sectionLabel]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setStreamedOutput("");
    setStreamedReasoning("");
    setError(null);
    setHasGenerated(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const runPass = async (options: StreamCompletionOptions) => {
      let receivedOutput = false;
      let hadError = false;

      const result = await streamCompletion(
        apiKey,
        model,
        prompt,
        userMessage,
        {
          onChunk: (chunk) => {
            receivedOutput = true;
            setStreamedOutput((prev) => prev + chunk);
          },
          onReasoning: (chunk) => {
            setStreamedReasoning((prev) => prev + chunk);
          },
          onComplete: () => {
          },
          onError: (err) => {
            hadError = true;
            setError(err.message);
          },
        },
        controller.signal,
        options,
      );

      return {
        ...result,
        receivedOutput,
        hadError,
      };
    };

    try {
      const primaryPass = await runPass({
        enableReasoning: supportsReasoning,
        reasoningEffort,
      });

      const shouldRetryWithoutReasoning =
        supportsReasoning &&
        !controller.signal.aborted &&
        !primaryPass.hadError &&
        !primaryPass.receivedOutput;

      if (shouldRetryWithoutReasoning) {
        const retryMessage = primaryPass.finishReason === "length"
          ? "Reasoning used the response budget before YAML was emitted. Retrying without reasoning…"
          : "Reasoning completed without YAML output. Retrying without reasoning…";

        setError(retryMessage);
        setStreamedReasoning((prev) => prev
          ? `${prev}

[No YAML was returned from the reasoning pass. Retrying without reasoning.]`
          : "[No YAML was returned from the reasoning pass. Retrying without reasoning.]",
        );

        const fallbackPass = await runPass({
          enableReasoning: false,
        });

        if (!fallbackPass.hadError && fallbackPass.receivedOutput) {
          setError(null);
        } else if (!fallbackPass.hadError && !fallbackPass.receivedOutput) {
          setError(
            fallbackPass.finishReason === "length"
              ? "Generation hit the output budget before any YAML was returned. This is usually token exhaustion rather than a timeout. Try a smaller source set or a larger-context model like Gemini 3 Pro."
              : "Generation completed but returned no YAML at all. This is usually an upstream model/output-budget issue rather than a timeout. Try Gemini 3 Pro/Flash or reduce the source/context size.",
          );
        }
      } else if (!primaryPass.hadError && !primaryPass.receivedOutput) {
        setError(
          primaryPass.finishReason === "length"
            ? "Generation hit the output budget before any YAML was returned. This is usually token exhaustion rather than a timeout."
            : "Generation completed without any YAML output.",
        );
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [apiKey, model, prompt, userMessage, canGenerate, supportsReasoning, reasoningEffort]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const handleApply = useCallback(() => {
    const trimmedOutput = streamedOutput.trim();

    if (!trimmedOutput) {
      setError("There is no generated YAML to apply yet.");
      return;
    }

    try {
      onApply(trimmedOutput);
      setStreamedOutput("");
      setStreamedReasoning("");
      setHasGenerated(false);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to apply generated YAML.");
    }
  }, [streamedOutput, onApply]);

  const handleDiscard = useCallback(() => {
    setStreamedOutput("");
    setStreamedReasoning("");
    setHasGenerated(false);
    setError(null);
    setGenerationMode('fresh_slate'); // Reset to default
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
          <Icon icon="lucide:bot" className={`h-5 w-5 ${disabled ? "text-white/30" : "text-fuchsia-300"}`} size={20} />
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
                      <AppImage
                        key={i}
                        src={source.favicon!}
                        alt={source.name}
                        width={20}
                        height={20}
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
              <Icon icon="lucide:file-code" className="h-3.5 w-3.5" size={14} />
              Prompt
            </button>
          )}
        </div>

        {/* Right side: controls */}
        {!disabled && (
          <div className="flex items-center gap-2">
            {/* Mode toggle - icon button */}
            {!isGenerating && (
              <button
                type="button"
                onClick={() => setGenerationMode(m => m === 'fresh_slate' ? 'review' : 'fresh_slate')}
                disabled={generationMode === 'fresh_slate' && !sectionHasContent}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors ${
                  generationMode === 'review'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800/50 text-white/50 hover:text-white/70 border border-transparent'
                } ${!sectionHasContent ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={generationMode === 'fresh_slate'
                  ? 'Fresh Slate: Generate from scratch'
                  : 'Review: Improve existing content'}
              >
                <Icon
                  icon={generationMode === 'fresh_slate' ? 'lucide:file-plus' : 'lucide:scan-eye'}
                  className="h-4 w-4"
                  size={16}
                />
                {generationMode === 'fresh_slate' ? 'Fresh' : 'Review'}
              </button>
            )}

            {/* Reasoning effort selector - only for Claude models, hidden during generation */}
            {supportsReasoning && !isGenerating && (
              <div className="flex items-center gap-1.5">
                <Icon icon="lucide:brain" className="h-4 w-4 text-fuchsia-300" size={16} />
                <select
                  aria-label="Reasoning effort"
                  value={reasoningEffort}
                  onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
                  className="h-7 w-36 rounded-lg border border-white/10 bg-slate-950/60 px-2.5 text-xs text-white shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30"
                >
                  {REASONING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} · {opt.description}
                    </option>
                  ))}
                </select>
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
                  <Icon icon="lucide:x" className="h-3.5 w-3.5" size={14} />
                  Cancel
                </>
              ) : (
                <>
                  <Icon icon="lucide:sparkles" className="h-3.5 w-3.5" size={14} />
                  Generate
                </>
              )}
            </Button>

            {/* Status indicators */}
            {isGenerating && (
              <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin text-fuchsia-300" size={16} />
            )}
            {hasGenerated && streamedOutput && !isGenerating && (
              <Icon icon="lucide:check" className="h-4 w-4 text-emerald-400" size={16} />
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 w-full mt-1">
            <Icon icon="lucide:alert-triangle" className="h-4 w-4 shrink-0" size={16} />
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
                  <Icon icon="lucide:chevron-down" className="h-3.5 w-3.5 text-fuchsia-300" size={14} />
                ) : (
                  <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5 text-fuchsia-300" size={14} />
                )}
                <Icon icon="lucide:brain" className="h-3.5 w-3.5 text-fuchsia-300" size={14} />
                <span className="text-xs font-medium text-fuchsia-300">
                  Reasoning
                </span>
                {isGenerating && !streamedOutput && (
                  <Icon icon="lucide:loader-2" className="ml-1 h-3 w-3 animate-spin text-fuchsia-300" size={12} />
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
                <label htmlFor={outputId} className="block text-xs font-medium text-white/50">
                  Generated YAML
                </label>
                <Textarea
                  id={outputId}
                  value={streamedOutput}
                  onChange={(e) => setStreamedOutput(e.target.value)}
                  className="min-h-[180px] font-mono text-xs resize-y"
                  placeholder="Generated YAML will appear here..."
                />
              </div>

              {/* Apply/Discard buttons */}
              {streamedOutput && !isGenerating && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="glass"
                    size="pill"
                    onClick={handleApply}
                  >
                    <Icon icon="lucide:check" className="h-3.5 w-3.5" size={14} />
                    Apply to Form
                  </Button>
                  <Button
                    variant="destructivePill"
                    size="pill"
                    onClick={handleDiscard}
                  >
                    <Icon icon="lucide:x" className="h-3.5 w-3.5" size={14} />
                    Discard
                  </Button>
                  {applyNote && (
                    <span className="text-xs text-white/50 italic">
                      {applyNote}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prompt Editor Modal */}
      {isPromptModalOpen && (
        <PromptEditorModal
          sectionKey={sectionKey}
          sectionLabel={sectionLabel}
          userMessage={userMessage}
          substanceSlug={substanceSlug}
          quoteSection={quoteSection}
          onClose={() => setIsPromptModalOpen(false)}
          username={username}
        />
      )}
    </div>
  );
});
