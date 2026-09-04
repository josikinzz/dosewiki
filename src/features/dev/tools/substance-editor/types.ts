import type { ReactNode } from "react";
import type { EditorStatusPillTone } from "@/features/dev/components";
export const STORAGE_KEYS = {
  API_KEY: "substanceEditor_apiKey",
  SELECTED_MODEL: "substanceEditor_model",
};

export const PROMPT_COLLAPSED_HEIGHT = 200;

// DXM-specific section markers in the prompt
export const DXM_SECTION_START = "**Special: DXM Plateau Dosing**";
export const DXM_SECTION_END = "For non-DXM substances, set `plateau_dosing` to `null`.";

export interface SubstanceEditorTabProps {
  /** Render function for commit panel - receives optional action slot for buttons and tab-specific description copy */
  renderCommitPanel?: (actionSlot?: ReactNode, description?: ReactNode) => ReactNode;
  /** The `/dev/articles/<slug>` deep link: the substance the tab opens on. */
  initialSlug?: string;
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

export type OutputViewMode = "yaml" | "preview" | "form";
export type CopyState = "idle" | "copied" | "error";
export type ReasoningMode = "off" | "adaptive" | "force";
export type GenerationMode = "fresh_slate" | "review";

export interface OutputSectionProps {
  streamedOutput: string;
  onOutputChange: (value: string) => void;
  outputViewMode: OutputViewMode;
  onViewModeChange: (mode: OutputViewMode) => void;
  isGenerating: boolean;
  onCopy: () => void;
  onDownload: () => void;
}

export type SortOrder = "alpha-asc" | "alpha-desc";
export type ReviewStatus = "needed" | "in_progress" | "completed";

export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; tone: EditorStatusPillTone }> = {
  needed: { label: "Review Needed", tone: "danger" },
  in_progress: { label: "In Progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
};

export interface SubstanceInfo {
  slug: string;
  name: string;
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
