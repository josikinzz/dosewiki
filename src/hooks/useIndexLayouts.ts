/**
 * Hook for loading index layouts from Convex.
 *
 * Loads the psychoactive, chemical, and mechanism index layouts
 * and parses them into the normalized format expected by buildLibrary.
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import {
  parseManualConfig,
  type NormalizedManualIndexConfig,
} from "../data/builders/manualIndexLoader";
import type { IndexConfigs } from "../data/builders/libraryBuilder";

/**
 * Hook to load all index layouts from Convex.
 *
 * @param enabled - Whether to load the layouts. When false, returns undefined.
 * @returns The parsed index configs, or undefined if loading/disabled.
 */
export function useIndexLayouts(enabled: boolean): {
  configs: IndexConfigs | undefined;
  isLoading: boolean;
} {
  // Load all three index layouts from Convex
  const psychoactive = useQuery(
    api.indexLayouts.getByType,
    enabled ? { type: "psychoactive" as const } : "skip"
  );
  const chemical = useQuery(
    api.indexLayouts.getByType,
    enabled ? { type: "chemical" as const } : "skip"
  );
  const mechanism = useQuery(
    api.indexLayouts.getByType,
    enabled ? { type: "mechanism" as const } : "skip"
  );

  // Parse and normalize the configs
  const configs = useMemo<IndexConfigs | undefined>(() => {
    // Not enabled
    if (!enabled) return undefined;

    // Still loading (undefined means query in progress)
    if (psychoactive === undefined || chemical === undefined || mechanism === undefined) {
      return undefined;
    }

    // Any layout missing - fall back to bundled configs
    if (!psychoactive || !chemical || !mechanism) {
      console.warn("[useIndexLayouts] Some layouts missing from Convex, falling back to bundled");
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
  }, [enabled, psychoactive, chemical, mechanism]);

  const isLoading =
    enabled &&
    (psychoactive === undefined || chemical === undefined || mechanism === undefined);

  return { configs, isLoading };
}
