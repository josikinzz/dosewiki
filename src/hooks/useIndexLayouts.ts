/**
 * Hook for loading index layouts through the editor read route.
 *
 * Loads the psychoactive, chemical, and mechanism index layouts
 * and parses them into the normalized format expected by buildLibrary.
 */

import { useMemo } from "react";
import { useEditorIndexLayouts, type EditorIndexLayoutRows } from "./useEditorRead";
import { parseManualConfig } from "../data/builders/manualIndexLoader";
import type { IndexConfigs } from "../data/builders/libraryBuilder";

/**
 * Hook to load all index layouts.
 * Uses a single query instead of 3 separate queries.
 *
 * @param enabled - Whether to load the layouts. When false, returns undefined.
 * @returns The parsed index configs, or undefined if loading/disabled.
 */
export function useIndexLayouts(enabled: boolean): {
  configs: IndexConfigs | undefined;
  layouts: EditorIndexLayoutRows | undefined;
  error: string | null;
  isLoading: boolean;
  retry: () => void;
} {
  const allLayouts = useEditorIndexLayouts(enabled);
  // Parse and normalize the configs
  const configs = useMemo<IndexConfigs | undefined>(() => {
    // Not enabled
    if (!enabled) return undefined;

    // Still loading (undefined means query in progress)
    if (allLayouts.data === undefined) {
      return undefined;
    }

    // Build lookup by type
    const byType = Object.fromEntries(
      allLayouts.data.map((layout) => [layout.type, layout])
    ) as Record<string, EditorIndexLayoutRows[number]>;

    const psychoactive = byType["psychoactive"];
    const chemical = byType["chemical"];
    const mechanism = byType["mechanism"];

    // Any layout missing - fall back to bundled configs
    if (!psychoactive || !chemical || !mechanism) {
      console.warn(
        "[useIndexLayouts] Some layouts missing from the server, falling back to bundled"
      );
      return undefined;
    }

    try {
      // Parse the raw layouts into normalized configs
      const parsedPsychoactive = parseManualConfig({
        version: psychoactive.version,
        categories: psychoactive.categories,
      });
      const parsedChemical = parseManualConfig({
        version: chemical.version,
        categories: chemical.categories,
      });
      const parsedMechanism = parseManualConfig({
        version: mechanism.version,
        categories: mechanism.categories,
      });

      return {
        psychoactive: parsedPsychoactive,
        chemical: parsedChemical,
        mechanism: parsedMechanism,
      };
    } catch (error) {
      console.error("[useIndexLayouts] Failed to parse configs:", error);
      return undefined;
    }
  }, [enabled, allLayouts.data]);

  return {
    configs,
    layouts: allLayouts.data,
    error: allLayouts.error
      ?? (enabled && allLayouts.data !== undefined && configs === undefined
        ? "The editing source did not return three valid index layouts."
        : null),
    isLoading: allLayouts.isLoading,
    retry: allLayouts.retry,
  };
}
