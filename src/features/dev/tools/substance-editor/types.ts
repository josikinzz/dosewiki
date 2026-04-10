import type { ReactNode } from "react";
import type { SourceInfo } from "@/hooks/useArticleSources";

export const STORAGE_KEYS = {
  API_KEY: "substanceEditor_apiKey",
  SELECTED_MODEL: "substanceEditor_model",
};

export const PROMPT_COLLAPSED_HEIGHT = 200;

// DXM-specific section markers in the prompt
export const DXM_SECTION_START = "**Special: DXM Plateau Dosing**";
export const DXM_SECTION_END = "For non-DXM substances, set `plateau_dosing` to `null`.";

export interface SubstanceEditorTabProps {
  generatorPrompt: string;
  originalGeneratorPrompt: string;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
  promptDiff: string;
  promptHasChanges: boolean;
  onCopyPrompt: () => void;
  /** Render function for commit panel - receives optional action slot for buttons */
  renderCommitPanel?: (actionSlot?: ReactNode) => ReactNode;
  /** @deprecated Use renderCommitPanel instead */
  commitPanel?: ReactNode;
}

export interface ApiConfigSectionProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  selectedModel: string;
  onModelChange: (value: string) => void;
  isValidatingKey: boolean;
  isKeyValid: boolean | null;
}

export interface SubstanceSelectorProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  filteredSubstances: SubstanceInfo[];
  selectedSubstanceSlug: string | null;
  onSubstanceSelect: (slug: string) => void;
  totalSubstances: number;
}

export interface SourceSelectorProps {
  availableSources: SourceInfo[];
  selectedSourceIds: Set<string>;
  onToggleSource: (sourceId: string) => void;
  onToggleSelectAll: () => void;
  isLoadingSubstance: boolean;
  totalTokenEstimate: number;
  contextUsagePercent: number;
  selectedModelInfo: ModelOption;
  isDxm: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  generationError: string | null;
  onGenerate: () => void;
  onCancel: () => void;
}

export type OutputViewMode = "yaml" | "preview" | "form";

export interface OutputSectionProps {
  streamedOutput: string;
  onOutputChange: (value: string) => void;
  outputViewMode: OutputViewMode;
  onViewModeChange: (mode: OutputViewMode) => void;
  isGenerating: boolean;
  onCopy: () => void;
  onDownload: () => void;
}

export interface SourcePreviewsProps {
  availableSources: SourceInfo[];
  selectedSourceIds: Set<string>;
  getSourceContent: (sourceId: string) => string | null;
  onOpenFullscreen: (sourceId: string) => void;
}

export interface SourcePreviewModalProps {
  source: SourceInfo | undefined;
  content: string | null;
  onClose: () => void;
}

export interface PromptEditorSectionProps {
  generatorPrompt: string;
  onPromptChange: (value: string) => void;
  isPromptDirty: boolean;
  onResetPrompt: () => void;
  onCopyPrompt: () => void;
  promptHasChanges: boolean;
  promptDiff: string;
  commitPanel?: ReactNode;
}

export type SortOrder = "sources-asc" | "sources-desc" | "alpha-asc" | "alpha-desc";
export type ReviewStatus = "needed" | "in_progress" | "completed";

export interface SubstanceInfo {
  slug: string;
  name: string;
  sources: SourceInfo[];
  reviewStatus: ReviewStatus;
}

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  contextWindow: number;
}

/**
 * Strips the DXM-specific plateau dosing section from the prompt.
 * Used when a non-DXM substance is selected.
 */
export function stripDxmSection(prompt: string): string {
  const startIdx = prompt.indexOf(DXM_SECTION_START);
  if (startIdx === -1) return prompt;

  const endIdx = prompt.indexOf(DXM_SECTION_END);
  if (endIdx === -1) return prompt;

  // Find the end of the line after the end marker
  const endOfSection = prompt.indexOf("\n", endIdx + DXM_SECTION_END.length);
  if (endOfSection === -1) return prompt;

  // Remove the section including any leading newlines
  let sectionStart = startIdx;
  while (sectionStart > 0 && prompt[sectionStart - 1] === "\n") {
    sectionStart--;
  }

  return prompt.slice(0, sectionStart) + "\n" + prompt.slice(endOfSection + 1);
}
