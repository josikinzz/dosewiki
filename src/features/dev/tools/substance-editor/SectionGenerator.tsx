/**
 * SectionGenerator - Reusable component for AI-assisted section generation.
 * 
 * Provides an inline generate button that expands to show:
 * - Streaming reasoning (collapsible)
 * - Streaming YAML output preview
 * - Apply/Discard buttons
 */

import { memo, useId, useState } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedSourceInfo } from "@/utils/sectionSources";
import { PromptEditorModal } from "./PromptEditorModal";
import type { SectionKey } from "@/data/config/sectionPrompts";
import type { QuoteSection } from "@/hooks/useQuotes";
import {
  REASONING_MODE_OPTIONS,
  REASONING_OPTIONS,
  useSectionGeneration,
} from "./useSectionGeneration";
import type { ReasoningEffortLevel } from "@/utils/api/openrouter";
import type { ReasoningMode } from "./types";

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
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const outputId = useId();
  const {
    canGenerate,
    effectiveReasoningConfig,
    error,
    generationMode,
    handleApply,
    handleCancel,
    handleDiscard,
    handleGenerate,
    hasContent,
    hasGenerated,
    isGenerating,
    isReasoningExpanded,
    reasoningEffort,
    reasoningMode,
    sectionHasContent,
    setReasoningEffort,
    setReasoningMode,
    setStreamedOutput,
    showOutput,
    streamedOutput,
    streamedReasoning,
    supportsReasoning,
    toggleGenerationMode,
    toggleReasoningExpanded,
    userMessage,
  } = useSectionGeneration({
    apiKey,
    currentArticleYaml,
    extractedContent,
    genericSources,
    isKeyValid,
    model,
    onApply,
    prompt,
    sectionKey,
    sectionLabel,
  });

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
                onClick={toggleGenerationMode}
                disabled={generationMode === "fresh_slate" && !sectionHasContent}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors ${
                  generationMode === "review"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-slate-800/50 text-white/50 hover:text-white/70 border border-transparent"
                } ${!sectionHasContent ? "opacity-40 cursor-not-allowed" : ""}`}
                title={generationMode === "fresh_slate"
                  ? "Fresh Slate: Generate from scratch"
                  : "Review: Improve existing content"}
              >
                <Icon
                  icon={generationMode === "fresh_slate" ? "lucide:file-plus" : "lucide:scan-eye"}
                  className="h-4 w-4"
                  size={16}
                />
                {generationMode === "fresh_slate" ? "Fresh" : "Review"}
              </button>
            )}

            {/* Reasoning controls - only for Claude models, hidden during generation */}
            {supportsReasoning && !isGenerating && (
              <div className="flex items-center gap-1.5">
                <Icon icon="lucide:brain" className="h-4 w-4 text-fuchsia-300" size={16} />
                <select
                  aria-label="Reasoning mode"
                  value={reasoningMode}
                  onChange={(event) => setReasoningMode(event.target.value as ReasoningMode)}
                  className="h-7 w-24 rounded-lg border border-white/10 bg-slate-950/60 px-2.5 text-xs text-white shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30"
                >
                  {REASONING_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Reasoning effort"
                  value={reasoningEffort}
                  onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffortLevel)}
                  disabled={reasoningMode === "off"}
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

            {supportsReasoning && !isGenerating && (
              <span className="basis-full text-right text-[11px] text-white/40">
                {effectiveReasoningConfig.reason}
              </span>
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
