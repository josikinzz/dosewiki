/**
 * Helper hook for managing Record<string, T> fields as arrays in React Hook Form.
 * 
 * Converts between Record<key, value> and Array<{ key, ...value }> representations
 * to enable useFieldArray-like operations on object-based schema fields.
 */

import { useCallback, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { SubstanceArticle, EffectSubcategory } from "@/schema";

export type SubcategoryWithKey = EffectSubcategory & { key: string };

type SensoryCategory =
  | "visual"
  | "auditory"
  | "tactile"
  | "olfactory"
  | "gustatory"
  | "multisensory";

type SubcategoryRecordPath =
  | `subjective_effects.${"cognitive" | "physical" | "progressive_stages"}`
  | `subjective_effects.sensory.${SensoryCategory}.subcategories`;

function useSubcategoryRecordField(fieldPath: SubcategoryRecordPath) {
  const { setValue, getValues } = useFormContext<SubstanceArticle>();

  const recordValue = useWatch({ name: fieldPath }) as
    | Record<string, EffectSubcategory>
    | undefined;

  const fields = useMemo((): SubcategoryWithKey[] => {
    if (!recordValue || typeof recordValue !== "object") return [];
    return Object.entries(recordValue).map(([key, value]) => ({
      key,
      ...value,
    }));
  }, [recordValue]);

  const append = useCallback(
    (item: SubcategoryWithKey) => {
      const current = getValues(fieldPath) ?? {};
      const newRecord = {
        ...current,
        [item.key]: { note: item.note, effects: item.effects },
      };
      setValue(fieldPath, newRecord, { shouldDirty: true });
    },
    [fieldPath, getValues, setValue],
  );

  const remove = useCallback(
    (key: string) => {
      const current = getValues(fieldPath) ?? {};
      const { [key]: _, ...rest } = current;
      setValue(fieldPath, rest, { shouldDirty: true });
    },
    [fieldPath, getValues, setValue],
  );

  const updateKey = useCallback(
    (oldKey: string, newKey: string) => {
      if (oldKey === newKey) return;
      const current = getValues(fieldPath) ?? {};
      if (!current[oldKey]) return;

      const entries = Object.entries(current);
      const newEntries = entries.map(([key, value]) =>
        key === oldKey ? [newKey, value] : [key, value],
      );
      setValue(fieldPath, Object.fromEntries(newEntries), { shouldDirty: true });
    },
    [fieldPath, getValues, setValue],
  );

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      const current = getValues(fieldPath) ?? {};
      const entries = Object.entries(current);
      if (fromIndex < 0 || fromIndex >= entries.length) return;
      if (toIndex < 0 || toIndex >= entries.length) return;

      const [removed] = entries.splice(fromIndex, 1);
      entries.splice(toIndex, 0, removed);
      setValue(fieldPath, Object.fromEntries(entries), { shouldDirty: true });
    },
    [fieldPath, getValues, setValue],
  );

  return { fields, append, remove, updateKey, move };
}

/**
 * Hook for managing a Record<string, EffectSubcategory> field as an array.
 * Provides append, remove, and update operations while keeping the form data in Record format.
 */
export function useRecordFieldArray(
  fieldPath: `subjective_effects.${"cognitive" | "physical" | "progressive_stages"}`,
) {
  return useSubcategoryRecordField(fieldPath);
}

/** Hook for managing subcategories within a sensory category. */
export function useSensorySubcategories(sense: SensoryCategory) {
  return useSubcategoryRecordField(
    `subjective_effects.sensory.${sense}.subcategories`,
  );
}
