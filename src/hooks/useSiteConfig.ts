import { useQuery, useMutation as useConvexMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";

// ============================================================================
// Types
// ============================================================================

export interface AboutConfig {
  aboutMarkdown?: string;
  aboutSubtitle?: string;
  founderProfileKeys?: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface UseAboutConfigResult {
  /** The About page configuration from Convex */
  config: AboutConfig | null;
  /** Whether the query is still loading */
  isLoading: boolean;
  /** Whether the config exists in Convex */
  exists: boolean;
  /** Save the About config to Convex */
  save: (config: Omit<AboutConfig, "updatedAt">) => Promise<{ updated: boolean }>;
  /** Whether saving is in progress */
  isSaving: boolean;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to load and save the About page configuration from Convex.
 *
 * Falls back to static content if Convex data doesn't exist yet.
 * The first save will create the document in Convex.
 */
export function useAboutConfig(): UseAboutConfigResult {
  const enabled = isConvexEnabled();

  // Query Convex for the About config
  const convexConfig = useQuery(
    enabled ? api.siteConfig.getAbout : undefined as never,
    enabled ? {} : undefined as never
  );

  // Mutation for saving
  const saveMutation = useConvexMutation(api.siteConfig.saveAbout);

  // Loading state: Convex is enabled and data hasn't arrived yet
  const isLoading = enabled && convexConfig === undefined;

  // Whether config exists in Convex
  const exists = convexConfig !== undefined && convexConfig !== null;

  // Config from Convex
  const config: AboutConfig | null = exists
    ? {
        aboutMarkdown: convexConfig.aboutMarkdown ?? undefined,
        aboutSubtitle: convexConfig.aboutSubtitle ?? undefined,
        founderProfileKeys: convexConfig.founderProfileKeys ?? undefined,
        updatedAt: convexConfig.updatedAt,
        updatedBy: convexConfig.updatedBy ?? undefined,
      }
    : null;

  // Save function
  const save = async (newConfig: Omit<AboutConfig, "updatedAt">) => {
    if (!enabled) {
      console.warn("Convex is not enabled. About config save skipped.");
      return { updated: false };
    }
    const result = await saveMutation({
      aboutMarkdown: newConfig.aboutMarkdown,
      aboutSubtitle: newConfig.aboutSubtitle,
      founderProfileKeys: newConfig.founderProfileKeys,
      updatedBy: newConfig.updatedBy,
    });
    return { updated: result.updated };
  };

  return {
    config,
    isLoading,
    exists,
    save,
    isSaving: false, // Convex mutations don't have a pending state in hooks
  };
}
