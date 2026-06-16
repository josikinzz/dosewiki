/**
 * SenseCategoryCard - Card for editing a sensory category (visual, auditory, etc.).
 * Each sense has a fixed name with a note and dynamic subcategories.
 */

import { useState, useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Icon, type IconName } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubcategoryEditor } from "./SubcategoryEditor";
import { useSensorySubcategories } from "./useRecordFieldArray";
import type { SubstanceArticle, EffectEntry } from "@/schema";

export type SenseType = "visual" | "auditory" | "tactile" | "olfactory" | "gustatory" | "multisensory";

export interface SenseCategoryCardProps {
  /** Which sense this card is for */
  sense: SenseType;
  /** Display label */
  label: string;
  /** Optional icon name for iconify */
  icon?: IconName;
  /** Prefix for input IDs */
  idPrefix: string;
}

export function SenseCategoryCard({
  sense,
  label,
  icon,
  idPrefix,
}: SenseCategoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { register } = useFormContext<SubstanceArticle>();
  
  // Watch the sense note
  const noteFieldPath = `subjective_effects.sensory.${sense}.note` as const;
  const noteValue = useWatch({ name: noteFieldPath }) as string | undefined;
  
  // Use the sensory subcategories hook
  const { fields, append, remove, updateKey, move } = useSensorySubcategories(sense);
  
  const hasContent = fields.length > 0 || (noteValue?.trim().length ?? 0) > 0;

  const handleAddSubcategory = useCallback(() => {
    const newKey = `New Subcategory ${fields.length + 1}`;
    append({ key: newKey, note: "", effects: [] });
  }, [fields.length, append]);

  // Minimal collapsed state
  if (!isExpanded) {
    return (
      <div className="rounded-lg border border-white/10 bg-[color-mix(in_srgb,#fff_1%,var(--theme-panel-base))]">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex w-full items-center justify-between p-3 text-left hover:bg-[color-mix(in_srgb,#fff_2%,var(--theme-control-base))] transition-colors rounded-lg"
        >
          <div className="flex items-center gap-2">
            {icon && <Icon icon={icon} className="h-4 w-4 text-fuchsia-300/70" size={16} />}
            <span className="text-sm font-medium text-white/80">{label}</span>
            {hasContent && (
              <span className="text-xs text-white/40">
                ({fields.length} subcategor{fields.length === 1 ? "y" : "ies"})
              </span>
            )}
          </div>
          <Icon icon="lucide:chevron-right" className="h-4 w-4 text-white/40" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[color-mix(in_srgb,#fff_2%,var(--theme-panel-base))]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(false)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-[color-mix(in_srgb,#fff_2%,var(--theme-control-base))] transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          {icon && <Icon icon={icon} className="h-4 w-4 text-fuchsia-300" size={16} />}
          <span className="text-sm font-semibold text-white">{label}</span>
          <span className="text-xs text-white/40">
            ({fields.length} subcategor{fields.length === 1 ? "y" : "ies"})
          </span>
        </div>
        <Icon icon="lucide:chevron-down" className="h-4 w-4 text-white/40" size={16} />
      </button>

      {/* Content */}
      <div className="p-3 space-y-4 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
        {/* Sense-level note */}
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-${sense}-note`} className="text-xs text-white/50">
            {label} Note
          </Label>
          <Textarea
            id={`${idPrefix}-${sense}-note`}
            {...register(noteFieldPath)}
            placeholder={`Brief qualitative description of ${label.toLowerCase()} effects...`}
            className="min-h-[60px] resize-none text-sm"
            rows={2}
          />
        </div>

        {/* Subcategories */}
        {fields.length > 0 ? (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <SensorySubcategoryEditorWrapper
                key={field.key}
                sense={sense}
                subcategoryKey={field.key}
                index={index}
                totalCount={fields.length}
                idPrefix={`${idPrefix}-${sense}`}
                onRemove={() => remove(field.key)}
                onMoveUp={() => move(index, index - 1)}
                onMoveDown={() => move(index, index + 1)}
                onKeyChange={(newKey) => updateKey(field.key, newKey)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/40 italic py-2 text-center">
            No subcategories added yet.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddSubcategory}
          className="w-full border-dashed"
        >
          <Icon icon="lucide:plus" className="h-3.5 w-3.5 mr-1.5" size={14} />
          Add Subcategory
        </Button>
      </div>
    </div>
  );
}

/**
 * Wrapper component that connects SubcategoryEditor to the sensory form state.
 */
interface SensorySubcategoryEditorWrapperProps {
  sense: SenseType;
  subcategoryKey: string;
  index: number;
  totalCount: number;
  idPrefix: string;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onKeyChange: (newKey: string) => void;
}

function SensorySubcategoryEditorWrapper({
  sense,
  subcategoryKey,
  index,
  totalCount,
  idPrefix,
  onRemove,
  onMoveUp,
  onMoveDown,
  onKeyChange,
}: SensorySubcategoryEditorWrapperProps) {
  const { setValue, getValues } = useFormContext<SubstanceArticle>();
  const fieldPath = `subjective_effects.sensory.${sense}.subcategories` as const;
  
  // Watch the subcategories
  const subcategories = useWatch({ name: fieldPath }) as Record<string, { note: string; effects: EffectEntry[] }> | undefined;
  const subcategoryData = subcategories?.[subcategoryKey] ?? { note: "", effects: [] };

  const handleNoteChange = useCallback((note: string) => {
    const current = getValues(fieldPath) ?? {};
    const updated = {
      ...current,
      [subcategoryKey]: { ...current[subcategoryKey], note },
    };
    setValue(fieldPath, updated, { shouldDirty: true });
  }, [fieldPath, subcategoryKey, getValues, setValue]);

  const handleEffectsChange = useCallback((effects: EffectEntry[]) => {
    const current = getValues(fieldPath) ?? {};
    const updated = {
      ...current,
      [subcategoryKey]: { ...current[subcategoryKey], effects },
    };
    setValue(fieldPath, updated, { shouldDirty: true });
  }, [fieldPath, subcategoryKey, getValues, setValue]);

  return (
    <SubcategoryEditor
      subcategoryKey={subcategoryKey}
      note={subcategoryData.note}
      effects={subcategoryData.effects}
      editableHeading={true}
      onHeadingChange={onKeyChange}
      onNoteChange={handleNoteChange}
      onEffectsChange={handleEffectsChange}
      onRemove={onRemove}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      canMoveUp={index > 0}
      canMoveDown={index < totalCount - 1}
      idPrefix={idPrefix}
      index={index}
    />
  );
}
