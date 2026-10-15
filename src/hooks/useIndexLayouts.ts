import { useMemo } from "react";
import { useEditorIndexLayouts, type EditorIndexLayoutRows } from "./useEditorRead";
import { parseManualConfig } from "../data/builders/manualIndexLoader";
import type { IndexConfigs } from "../data/builders/libraryBuilder";

export function useIndexLayouts(enabled: boolean): {
  configs: IndexConfigs | undefined;
  layouts: EditorIndexLayoutRows | undefined;
  error: string | null;
  isLoading: boolean;
  retry: () => void;
} {
  const allLayouts = useEditorIndexLayouts(enabled);
  const configs = useMemo<IndexConfigs | undefined>(() => {
    if (!enabled) return undefined;

    if (allLayouts.data === undefined) {
      return undefined;
    }

    const byType = Object.fromEntries(
      allLayouts.data.map((layout) => [layout.type, layout])
    ) as Record<string, EditorIndexLayoutRows[number]>;

    const psychoactive = byType["psychoactive"];
    const chemical = byType["chemical"];
    const mechanism = byType["mechanism"];

    if (!psychoactive || !chemical || !mechanism) {
      console.warn(
        "[useIndexLayouts] Some layouts missing from the server, falling back to bundled"
      );
      return undefined;
    }

    try {
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
