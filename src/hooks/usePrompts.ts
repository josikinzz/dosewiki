import { useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";
import {
  sectionKeyToPromptKey,
  type SectionKey,
} from "../data/config/promptRegistry";

// ============================================================================
// Types
// ============================================================================

export interface PromptData {
  key: string;
  content: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface UsePromptResult {
  /** The prompt content from Convex (empty string if not loaded yet) */
  content: string;
  /** Whether the query is still loading */
  isLoading: boolean;
  /** Whether the prompt exists in Convex */
  exists: boolean;
  /** Last update timestamp */
  updatedAt?: string;
  /** Last updater */
  updatedBy?: string;
  /** Save the prompt to Convex */
  save: (content: string, updatedBy?: string) => Promise<void>;
  /** Whether saving is in progress */
  isSaving: boolean;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to load and optionally save a prompt from Convex.
 *
 * Prompts are stored ONLY in Convex - there is no static fallback.
 * Run `node scripts/migrate-prompts-to-convex.mjs` to populate prompts.
 *
 * @param key - The prompt key (e.g., "generator", "section_harm_potential")
 * @returns PromptData with content and save function
 */
export function usePrompt(key: string): UsePromptResult {
  const enabled = isConvexEnabled();

  // Query Convex for the prompt
  const convexPrompt = useQuery(
    enabled ? api.prompts.getByKey : undefined as never,
    enabled ? { key } : undefined as never
  );

  // Loading state: Convex is enabled and data hasn't arrived yet
  const isLoading = enabled && convexPrompt === undefined;

  // Content from Convex (empty string if not found or still loading)
  const exists = convexPrompt !== undefined && convexPrompt !== null;
  const content = exists ? convexPrompt.content : "";

  // Save function
  const save = useCallback(async (newContent: string, _updatedBy?: string) => {
    if (!enabled) {
      console.warn("Convex is not enabled. Prompt save skipped.");
      return;
    }

    const response = await fetch("/api/save-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, content: newContent }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = typeof result.error === "string" ? result.error : "Failed to save prompt.";
      throw new Error(error);
    }
  }, [enabled, key]);

  return {
    content,
    isLoading,
    exists,
    updatedAt: exists ? convexPrompt.updatedAt : undefined,
    updatedBy: exists ? convexPrompt.updatedBy : undefined,
    save,
    isSaving: false, // Convex mutations don't have a pending state in hooks
  };
}

/**
 * Hook to load all prompts from Convex.
 * Useful for displaying a list of editable prompts.
 */
export function useAllPrompts() {
  const enabled = isConvexEnabled();

  const convexPrompts = useQuery(
    enabled ? api.prompts.getAll : undefined as never,
    enabled ? {} : undefined as never
  );

  const isLoading = enabled && convexPrompts === undefined;

  // Map Convex prompts to PromptData format
  const prompts: PromptData[] = (convexPrompts ?? []).map((p) => ({
    key: p.key,
    content: p.content,
    updatedAt: p.updatedAt,
    updatedBy: p.updatedBy,
  }));

  return {
    prompts,
    isLoading,
    isConvexEnabled: enabled,
  };
}

/**
 * Hook specifically for section prompts.
 *
 * @param sectionKey - The section key (e.g., "harm_potential", "pharmacology")
 */
export function useSectionPrompt(sectionKey: SectionKey): UsePromptResult {
  return usePrompt(sectionKeyToPromptKey(sectionKey));
}

/**
 * Hook for the main generator prompt.
 */
export function useGeneratorPrompt(): UsePromptResult {
  return usePrompt("generator");
}
