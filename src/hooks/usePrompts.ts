import { useQuery, useMutation as useConvexMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";
import { sectionPrompts, type SectionKey } from "../data/config/sectionPrompts";
import { systemPrompt as staticGeneratorPrompt } from "../data/config/generatorPrompt";

// ============================================================================
// Types
// ============================================================================

export interface PromptData {
  key: string;
  content: string;
  updatedAt?: string;
  updatedBy?: string;
  isFromConvex: boolean;
}

export interface UsePromptResult {
  /** The prompt content (from Convex if available, otherwise static) */
  content: string;
  /** Whether the prompt is loaded from Convex */
  isFromConvex: boolean;
  /** Whether the query is still loading */
  isLoading: boolean;
  /** Last update timestamp (only if from Convex) */
  updatedAt?: string;
  /** Last updater (only if from Convex) */
  updatedBy?: string;
  /** Save the prompt to Convex */
  save: (content: string, updatedBy?: string) => Promise<void>;
  /** Whether saving is in progress */
  isSaving: boolean;
}

// ============================================================================
// Static Prompt Map
// ============================================================================

/**
 * Map of prompt keys to static content for fallback.
 */
const staticPrompts: Record<string, string> = {
  generator: staticGeneratorPrompt,
  // Section prompts have keys like "section_harm_potential"
  ...Object.fromEntries(
    Object.entries(sectionPrompts).map(([key, content]) => [
      `section_${key}`,
      content,
    ])
  ),
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to load and optionally save a prompt.
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
  
  // Mutation for saving
  const saveMutation = useConvexMutation(api.prompts.save);
  
  // Determine content source
  const isFromConvex = enabled && convexPrompt !== undefined && convexPrompt !== null;
  const content = isFromConvex
    ? convexPrompt.content
    : staticPrompts[key] ?? "";
  
  // Loading state: Convex is enabled and data hasn't arrived yet
  const isLoading = enabled && convexPrompt === undefined;
  
  // Save function
  const save = async (newContent: string, updatedBy?: string) => {
    if (!enabled) {
      console.warn("Convex is not enabled. Prompt save skipped.");
      return;
    }
    await saveMutation({ key, content: newContent, updatedBy });
  };
  
  return {
    content,
    isFromConvex,
    isLoading,
    updatedAt: isFromConvex ? convexPrompt.updatedAt : undefined,
    updatedBy: isFromConvex ? convexPrompt.updatedBy : undefined,
    save,
    isSaving: false, // Convex mutations don't have a pending state in hooks
  };
}

/**
 * Hook to load all prompts at once.
 * Useful for displaying a list of editable prompts.
 */
export function useAllPrompts() {
  const enabled = isConvexEnabled();
  
  const convexPrompts = useQuery(
    enabled ? api.prompts.getAll : undefined as never,
    enabled ? {} : undefined as never
  );
  
  const isLoading = enabled && convexPrompts === undefined;
  
  // Merge Convex prompts with static fallbacks
  const prompts: PromptData[] = [];
  
  // Add all static prompts
  for (const [key, content] of Object.entries(staticPrompts)) {
    const convexVersion = convexPrompts?.find((p) => p.key === key);
    
    prompts.push({
      key,
      content: convexVersion?.content ?? content,
      updatedAt: convexVersion?.updatedAt,
      updatedBy: convexVersion?.updatedBy,
      isFromConvex: !!convexVersion,
    });
  }
  
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
  return usePrompt(`section_${sectionKey}`);
}

/**
 * Hook for the main generator prompt.
 */
export function useGeneratorPrompt(): UsePromptResult {
  return usePrompt("generator");
}

/**
 * Get static prompt content without hooks (for non-component use).
 * This is a synchronous fallback that doesn't query Convex.
 */
export function getStaticPrompt(key: string): string {
  return staticPrompts[key] ?? "";
}

/**
 * Get static section prompt content.
 */
export function getStaticSectionPrompt(sectionKey: SectionKey): string {
  return sectionPrompts[sectionKey] ?? "";
}
