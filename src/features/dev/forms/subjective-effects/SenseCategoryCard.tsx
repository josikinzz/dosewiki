/**
 * SenseCategoryCard - Card for editing a sensory category (visual, auditory, etc.).
 * Each sense has a fixed name with a note and dynamic subcategories.
 */

import { useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Icon, type IconName } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyStateSurface } from "@/components/ui/surface";
import { CollapsibleEditorCard } from "../CollapsibleEditorCard";
import { SubcategoryEditor } from "./SubcategoryEditor";
import { useSensorySubcategories } from "./useRecordFieldArray";
import { useGrowToContent } from "./useGrowToContent";
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
  pairedIndicator?: boolean;
}

export function SenseCategoryCard({
  sense,
  label,
  icon,
  idPrefix,
  pairedIndicator = false,
}: SenseCategoryCardProps) {
  const { register } = useFormContext<SubstanceArticle>();

  // Sense note field path
  const noteFieldPath = `subjective_effects.sensory.${sense}.note` as const;
  const { ref: registerNoteRef, ...noteRegistration } = register(noteFieldPath);
  const noteField = useGrowToContent();

  // Use the sensory subcategories hook
  const { fields, append, remove, updateKey, move } = useSensorySubcategories(sense);

  return (
    <CollapsibleEditorCard
      title={label}
      icon={icon ? <Icon icon={icon} size={16} /> : undefined}
      count={fields.length}
      density="compact"
      pairedIndicator={pairedIndicator}
    >
      <div className="space-y-4">
        {/* Sense-level note */}
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-${sense}-note`} className="text-xs theme-text-muted">
            {label} Note
          </Label>
          <Textarea
            id={`${idPrefix}-${sense}-note`}
            {...noteRegistration}
            ref={(element) => {
              registerNoteRef(element);
              noteField.ref(element);
            }}
            onInput={noteField.grow}
            placeholder={`Brief qualitative description of ${label.toLowerCase()} effects...`}
            className="min-h-[60px] resize-none"
            rows={2}
          />
        </div>

        {/* Subcategories */}
        {fields.length > 0 ? (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <SensorySubcategoryEditorWrapper
                key={field.id}
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
          <EmptyStateSurface
            padding="sm"
            radius="md"
            className="theme-text-faint text-center text-xs"
          >
            No subcategories added yet.
          </EmptyStateSurface>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={append}
          className="w-full border-dashed"
        >
          <Icon icon="lucide:plus" className="h-3.5 w-3.5 mr-1.5" size={14} />
          Add Subcategory
        </Button>
      </div>
    </CollapsibleEditorCard>
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
  onKeyChange: (newKey: string) => string | undefined;
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
