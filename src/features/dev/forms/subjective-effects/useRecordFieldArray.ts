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

/**
 * Hook for managing a Record<string, EffectSubcategory> field as an array.
 * Provides append, remove, and update operations while keeping the form data in Record format.
 */
export function useRecordFieldArray(
  fieldPath: `subjective_effects.${"cognitive" | "physical" | "progressive_stages"}`
) {
  const { setValue, getValues } = useFormContext<SubstanceArticle>();
  
  // Watch the field to trigger re-renders
  const recordValue = useWatch({ name: fieldPath }) as Record<string, EffectSubcategory> | undefined;
  
  // Convert Record to array with keys
  const fields = useMemo((): SubcategoryWithKey[] => {
    if (!recordValue || typeof recordValue !== "object") return [];
    return Object.entries(recordValue).map(([key, value]) => ({
      key,
      ...value,
    }));
  }, [recordValue]);

  // Append a new subcategory
  const append = useCallback((item: SubcategoryWithKey) => {
    const current = getValues(fieldPath) ?? {};
    const newRecord = {
      ...current,
      [item.key]: { note: item.note, effects: item.effects },
    };
    setValue(fieldPath, newRecord, { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  // Remove a subcategory by key
  const remove = useCallback((key: string) => {
    const current = getValues(fieldPath) ?? {};
    const { [key]: _, ...rest } = current;
    setValue(fieldPath, rest, { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  // Update a subcategory's key (rename)
  const updateKey = useCallback((oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const current = getValues(fieldPath) ?? {};
    const value = current[oldKey];
    if (!value) return;
    
    // Create new object with updated key (preserving order as much as possible)
    const entries = Object.entries(current);
    const newEntries = entries.map(([k, v]) => 
      k === oldKey ? [newKey, v] : [k, v]
    );
    setValue(fieldPath, Object.fromEntries(newEntries), { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  // Move a subcategory up or down
  const move = useCallback((fromIndex: number, toIndex: number) => {
    const current = getValues(fieldPath) ?? {};
    const entries = Object.entries(current);
    if (fromIndex < 0 || fromIndex >= entries.length) return;
    if (toIndex < 0 || toIndex >= entries.length) return;
    
    const [removed] = entries.splice(fromIndex, 1);
    entries.splice(toIndex, 0, removed);
    setValue(fieldPath, Object.fromEntries(entries), { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  return { fields, append, remove, updateKey, move };
}

/**
 * Hook for managing subcategories within a sensory category.
 * Similar to useRecordFieldArray but for the nested sensory.{sense}.subcategories path.
 */
export function useSensorySubcategories(
  sense: "visual" | "auditory" | "tactile" | "olfactory" | "gustatory" | "multisensory"
) {
  const fieldPath = `subjective_effects.sensory.${sense}.subcategories` as const;
  const { setValue, getValues } = useFormContext<SubstanceArticle>();
  
  // Watch the subcategories field
  const recordValue = useWatch({ name: fieldPath }) as Record<string, EffectSubcategory> | undefined;
  
  // Convert Record to array with keys
  const fields = useMemo((): SubcategoryWithKey[] => {
    if (!recordValue || typeof recordValue !== "object") return [];
    return Object.entries(recordValue).map(([key, value]) => ({
      key,
      ...value,
    }));
  }, [recordValue]);

  // Append a new subcategory
  const append = useCallback((item: SubcategoryWithKey) => {
    const current = getValues(fieldPath) ?? {};
    const newRecord = {
      ...current,
      [item.key]: { note: item.note, effects: item.effects },
    };
    setValue(fieldPath, newRecord, { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  // Remove a subcategory by key
  const remove = useCallback((key: string) => {
    const current = getValues(fieldPath) ?? {};
    const { [key]: _, ...rest } = current;
    setValue(fieldPath, rest, { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  // Update a subcategory's key (rename)
  const updateKey = useCallback((oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const current = getValues(fieldPath) ?? {};
    const value = current[oldKey];
    if (!value) return;
    
    const entries = Object.entries(current);
    const newEntries = entries.map(([k, v]) => 
      k === oldKey ? [newKey, v] : [k, v]
    );
    setValue(fieldPath, Object.fromEntries(newEntries), { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  // Move a subcategory up or down
  const move = useCallback((fromIndex: number, toIndex: number) => {
    const current = getValues(fieldPath) ?? {};
    const entries = Object.entries(current);
    if (fromIndex < 0 || fromIndex >= entries.length) return;
    if (toIndex < 0 || toIndex >= entries.length) return;
    
    const [removed] = entries.splice(fromIndex, 1);
    entries.splice(toIndex, 0, removed);
    setValue(fieldPath, Object.fromEntries(entries), { shouldDirty: true });
  }, [fieldPath, getValues, setValue]);

  return { fields, append, remove, updateKey, move };
}
