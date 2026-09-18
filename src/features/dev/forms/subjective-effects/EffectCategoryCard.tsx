/**
 * EffectCategoryCard - Collapsible card for editing Physical/Cognitive/Progressive Stages.
 * Uses useRecordFieldArray to manage the dynamic subcategory structure.
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
import { useRecordFieldArray } from "./useRecordFieldArray";
import type { SubstanceArticle, EffectEntry } from "@/schema";

export interface EffectCategoryCardProps {
  /** Field path for this category */
  fieldPath: "subjective_effects.cognitive" | "subjective_effects.physical" | "subjective_effects.progressive_stages";
  /** Display title */
  title: string;
  /** Icon name for iconify */
  icon: IconName;
  /** Prefix for input IDs */
  idPrefix: string;
  /** Whether this section is optional (e.g., progressive_stages) */
  optional?: boolean;
  /** Field path for the category note (shown at top of section) */
  noteFieldPath?: "subjective_effects.notes.physical" | "subjective_effects.notes.cognitive";
  pairedIndicator?: boolean;
}

export function EffectCategoryCard({
  fieldPath,
  title,
  icon,
  idPrefix,
  optional = false,
  noteFieldPath,
  pairedIndicator = false,
}: EffectCategoryCardProps) {
  const { register } = useFormContext<SubstanceArticle>();

  const { fields, append, remove, updateKey, move } = useRecordFieldArray(fieldPath);

  const noteId = `${idPrefix}-${title.toLowerCase().replace(/\s+/g, "-")}-note`;
  const childIdPrefix = `${idPrefix}-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <CollapsibleEditorCard
      title={title}
      icon={<Icon icon={icon} size={16} />}
      count={fields.length}
      density="compact"
      pairedIndicator={pairedIndicator}
      badge={
        optional ? (
          <span className="theme-text-faint text-xs">(optional)</span>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Category-level note at top of section */}
        {noteFieldPath && (
          <div className="space-y-1">
            <Label htmlFor={noteId}>{title} Note</Label>
            <Textarea
              id={noteId}
              className="min-h-[80px]"
              {...register(noteFieldPath)}
              placeholder={`Brief qualitative description of ${title.toLowerCase()}...`}
            />
          </div>
        )}

        {fields.length > 0 ? (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <SubcategoryEditorWrapper
                key={field.id}
                fieldPath={fieldPath}
                subcategoryKey={field.key}
                index={index}
                totalCount={fields.length}
                idPrefix={childIdPrefix}
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
            radius="lg"
            className="theme-text-faint text-center text-sm"
          >
            No subcategories added yet.
          </EmptyStateSurface>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={append}
          className="w-full border-dashed"
        >
          <Icon icon="lucide:plus" className="h-4 w-4 mr-2" size={16} />
          Add Subcategory
        </Button>
      </div>
    </CollapsibleEditorCard>
  );
}

/**
 * Wrapper component that connects SubcategoryEditor to the form state.
 * Handles reading and writing the subcategory data through React Hook Form.
 */
interface SubcategoryEditorWrapperProps {
  fieldPath: "subjective_effects.cognitive" | "subjective_effects.physical" | "subjective_effects.progressive_stages";
  subcategoryKey: string;
  index: number;
  totalCount: number;
  idPrefix: string;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onKeyChange: (newKey: string) => string | undefined;
}

function SubcategoryEditorWrapper({
  fieldPath,
  subcategoryKey,
  index,
  totalCount,
  idPrefix,
  onRemove,
  onMoveUp,
  onMoveDown,
  onKeyChange,
}: SubcategoryEditorWrapperProps) {
  const { setValue, getValues } = useFormContext<SubstanceArticle>();
  
  // Watch the specific subcategory
  const categoryData = useWatch({ name: fieldPath }) as Record<string, { note: string; effects: EffectEntry[] }> | undefined;
  const subcategoryData = categoryData?.[subcategoryKey] ?? { note: "", effects: [] };

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
