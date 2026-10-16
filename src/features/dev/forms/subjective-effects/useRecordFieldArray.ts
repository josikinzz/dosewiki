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
      setValue(fieldPath, {});
      setValue(fieldPath, Object.fromEntries(entries), { shouldDirty: true });
    },
    [fieldPath, getValues, setValue],
  );

  return { fields, append, remove, updateKey, move };
}

export function useRecordFieldArray(fieldPath: `subjective_effects.${"cognitive" | "physical" | "progressive_stages"}`,) { return useSubcategoryRecordField(fieldPath); }

export function useSensorySubcategories(sense: SensoryCategory) { return useSubcategoryRecordField(
  `subjective_effects.sensory.${sense}.subcategories`,
); }
