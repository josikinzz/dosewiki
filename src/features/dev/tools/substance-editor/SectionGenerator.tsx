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
import {
  EditorSelect,
  EditorStatusPill,
} from "@/features/dev/components";
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
  const baseId = useId();
  const outputId = `${baseId}-output`;
  const reasoningModeSelectId = `${baseId}-reasoning-mode`;
  const reasoningEffortSelectId = `${baseId}-reasoning-effort`;
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

  // Disabled generators (e.g. sections without generation support yet) render
  // as a single faint caption instead of a dimmed full toolbar.
  if (disabled) {
    return disabledMessage ? (
      <p className="theme-text-faint mb-4 flex items-center gap-1.5 text-xs">
        <Icon icon="lucide:bot" className="h-3.5 w-3.5 shrink-0" size={14} />
        {disabledMessage}
      </p>
    ) : null;
  }

  const missingApiKey = !apiKey || !isKeyValid;

  return (
    <div className="mb-4 rounded-xl border border-[var(--theme-border-subtle)] bg-[var(--theme-field-surface)]">
      <div className="space-y-2.5 px-4 py-3">
        {/* Context row: what the generator will read, plus the prompt preview */}
        <div className="flex flex-wrap items-center gap-2">
          <Icon icon="lucide:bot" className="theme-icon-accent h-5 w-5" size={20} />
          {extractedSources && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[color:var(--theme-evidence-text)]">
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
                        className="h-5 w-5 rounded-full border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-deep)]"
                      />
                    ))}
                </div>
              )}
            </div>
          )}
          {!extractedSources && extractedContent && (
            <EditorStatusPill tone="success">Sources ready</EditorStatusPill>
          )}
          {!extractedContent && genericSources.length > 0 && (
            <span className="theme-text-faint text-xs">
              {genericSources.length} source{genericSources.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Prompt preview (brand-emphasis action) */}
          {hasContent && (
            <Button
              type="button"
              variant="accent"
              size="pill"
              onClick={() => setIsPromptModalOpen(true)}
              className="ml-auto"
            >
              <Icon icon="lucide:file-code" />
              Prompt
            </Button>
          )}
        </div>

        {/* Controls row: labeled mode/effort controls, Generate right-aligned */}
        <div className="flex flex-wrap items-end gap-3">
          {!isGenerating && (
            <div className="space-y-1">
              <span className="theme-text-faint block text-[10px] font-medium uppercase tracking-wider">
                Mode
              </span>
              <Button
                type="button"
                variant="ghost"
                size="auto"
                onClick={toggleGenerationMode}
                disabled={generationMode === "fresh_slate" && !sectionHasContent}
                className={`h-8 gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                  generationMode === "review"
                    ? "border-[color:var(--theme-warning-border)] bg-[var(--theme-warning-bg)] text-[color:var(--theme-warning-text)]"
                    : "theme-text-muted border-transparent bg-[var(--theme-frosted-control-on-panel-bg)] hover:text-[color:var(--theme-text-secondary)]"
                }${!sectionHasContent ? " opacity-40 cursor-not-allowed" : ""}`}
                title={generationMode === "fresh_slate"
                  ? "Fresh Slate: Generate from scratch"
                  : "Review: Improve existing content"}
              >
                <Icon
                  icon={generationMode === "fresh_slate" ? "lucide:file-plus" : "lucide:scan-eye"}
                  size={16}
                />
                {generationMode === "fresh_slate" ? "Fresh" : "Review"}
              </Button>
            </div>
          )}

          {/* Reasoning controls - only for Claude models, hidden during generation */}
          {supportsReasoning && !isGenerating && (
            <>
              <div className="w-32 space-y-1">
                <label
                  htmlFor={reasoningModeSelectId}
                  className="theme-text-faint block text-[10px] font-medium uppercase tracking-wider"
                >
                  Reasoning
                </label>
                <EditorSelect
                  id={reasoningModeSelectId}
                  aria-label="Reasoning mode"
                  selectSize="sm"
                  value={reasoningMode}
                  onChange={(event) => setReasoningMode(event.target.value as ReasoningMode)}
                  className="h-8 text-xs"
                >
                  {REASONING_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </EditorSelect>
              </div>
              <div className="w-48 space-y-1">
                <label
                  htmlFor={reasoningEffortSelectId}
                  className="theme-text-faint block text-[10px] font-medium uppercase tracking-wider"
                >
                  Effort
                </label>
                <EditorSelect
                  id={reasoningEffortSelectId}
                  aria-label="Reasoning effort"
                  selectSize="sm"
                  value={reasoningEffort}
                  onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffortLevel)}
                  disabled={reasoningMode === "off"}
                  className="h-8 text-xs"
                >
                  {REASONING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} · {opt.description}
                    </option>
                  ))}
                </EditorSelect>
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isGenerating && (
              <Icon icon="lucide:loader-2" className="theme-icon-accent h-4 w-4 animate-spin" size={16} />
            )}
            {hasGenerated && streamedOutput && !isGenerating && (
              <Icon icon="lucide:check" className="h-4 w-4 text-[color:var(--theme-evidence-text)]" size={16} />
            )}
            <Button
              variant={isGenerating ? "destructive" : "accent"}
              size="auto"
              onClick={isGenerating ? handleCancel : handleGenerate}
              disabled={!canGenerate && !isGenerating}
              title={
                !canGenerate && !isGenerating && missingApiKey
                  ? "Configure an OpenRouter API key in API Configuration first"
                  : undefined
              }
              className="h-8 rounded-full px-6 font-medium"
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
          </div>
        </div>

        {supportsReasoning && !isGenerating && (
          <p className="theme-text-faint text-[11px]">
            {effectiveReasoningConfig.reason}
          </p>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-[color:var(--theme-danger-text)]">
            <Icon icon="lucide:alert-triangle" className="h-4 w-4 shrink-0" size={16} />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {/* Cannot generate: the missing-key case lives on the button title so
            it is not repeated in every section */}
        {!canGenerate && !isGenerating && !error && !missingApiKey && (
          <p className="theme-text-faint text-xs">No source content available</p>
        )}
      </div>

      {/* Output area - only shown after generation starts */}
      {showOutput && !disabled && (
        <div className="space-y-3 border-t border-[var(--theme-border-subtle)] px-4 py-3">
          {/* Reasoning box - collapsible */}
          {(streamedReasoning || (isGenerating && !streamedOutput)) && (
            <div className="overflow-hidden rounded-lg border border-[color:color-mix(in_srgb,var(--theme-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-accent)_10%,var(--theme-surface-deep))]">
              <button
                type="button"
                onClick={toggleReasoningExpanded}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--theme-accent)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
              >
                {isReasoningExpanded ? (
                  <Icon icon="lucide:chevron-down" className="theme-icon-accent h-3.5 w-3.5" size={14} />
                ) : (
                  <Icon icon="lucide:chevron-right" className="theme-icon-accent h-3.5 w-3.5" size={14} />
                )}
                <Icon icon="lucide:brain" className="theme-icon-accent h-3.5 w-3.5" size={14} />
                <span className="theme-accent-emphasis text-xs font-medium">
                  Reasoning
                </span>
                {isGenerating && !streamedOutput && (
                  <Icon icon="lucide:loader-2" className="theme-icon-accent ml-1 h-3 w-3 animate-spin" size={12} />
                )}
              </button>
              {isReasoningExpanded && (
                <div className="border-t border-[color:color-mix(in_srgb,var(--theme-accent)_30%,transparent)] px-3 py-2">
                  <pre className="theme-text-secondary max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono text-xs">
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
                <label htmlFor={outputId} className="theme-text-muted block text-xs font-medium">
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
                    <span className="theme-text-muted text-xs italic">
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
