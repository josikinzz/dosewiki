/**
 * Helper hook for managing Record<string, T> fields as arrays in React Hook Form.
 * 
 * Converts between Record<key, value> and Array<{ key, ...value }> representations
 * to enable useFieldArray-like operations on object-based schema fields.
 */

import { useCallback, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { SubstanceArticle, EffectSubcategory } from "@/schema";

type SubcategoryWithKey = EffectSubcategory & { key: string }

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
  const { control, setValue, getValues } = useFormContext<SubstanceArticle>();
  const fieldIds = useRef<Map<string, number> | null>(null);
  const nextFieldId = useRef(0);
  fieldIds.current ??= new Map();

  // Compare ordered entries: record equality alone ignores a move's key order.
  const entries = useWatch({
    control,
    name: fieldPath,
    compute: (recordValue) => Object.entries(recordValue ?? {}),
  });

  const fields = useMemo((): (SubcategoryWithKey & { id: number })[] => {
    return entries.map(([key, value]) => {
      const ids = fieldIds.current!;
      if (!ids.has(key)) ids.set(key, nextFieldId.current++);
      return { key, ...value, id: ids.get(key)! };
    });
  }, [entries]);

  const append = useCallback(
    () => {
      const current = getValues(fieldPath) ?? {};
      let number = Object.keys(current).length + 1;
      // `hasOwnProperty` rather than `Object.hasOwn`, which this project's `lib`
      // target does not carry.
      while (Object.prototype.hasOwnProperty.call(current, `New Subcategory ${number}`)) {
        number += 1;
      }
      const key = `New Subcategory ${number}`;
      const newRecord = {
        ...current,
        [key]: { note: "", effects: [] },
      };
      setValue(fieldPath, newRecord, { shouldDirty: true });
    },
    [fieldPath, getValues, setValue],
  );

  const remove = useCallback(
    (key: string) => {
      const current = getValues(fieldPath) ?? {};
      const { [key]: _, ...rest } = current;
      fieldIds.current!.delete(key);
      setValue(fieldPath, rest, { shouldDirty: true });
    },
    [fieldPath, getValues, setValue],
  );

  const updateKey = useCallback(
    (oldKey: string, newKey: string) => {
      if (oldKey === newKey) return;
      const current = getValues(fieldPath) ?? {};
      if (!current[oldKey]) return;
      if (!newKey.trim()) return "Enter a subcategory name.";
      if (Object.prototype.hasOwnProperty.call(current, newKey)) {
        return "A subcategory with this name already exists. Choose a different name.";
      }
      const id = fieldIds.current!.get(oldKey);
      if (id !== undefined) fieldIds.current!.set(newKey, id);
      fieldIds.current!.delete(oldKey);

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
      // RHF treats records with reordered keys as equal. Replace this one record
      // in the same event so the final value, not just the display, keeps the order.
      setValue(fieldPath, {});
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
export function useRecordFieldArray(fieldPath: `subjective_effects.${"cognitive" | "physical" | "progressive_stages"}`,) { return useSubcategoryRecordField(fieldPath); }

/** Hook for managing subcategories within a sensory category. */
export function useSensorySubcategories(sense: SensoryCategory) { return useSubcategoryRecordField(
  `subjective_effects.sensory.${sense}.subcategories`,
); }
