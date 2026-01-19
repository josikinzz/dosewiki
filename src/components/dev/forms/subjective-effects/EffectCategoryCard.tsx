/**
 * EffectCategoryCard - Collapsible card for editing Physical/Cognitive/Progressive Stages.
 * Uses useRecordFieldArray to manage the dynamic subcategory structure.
 */

import { useState, useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Icon, type IconName } from "../../../common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubcategoryEditor } from "./SubcategoryEditor";
import { useRecordFieldArray } from "./useRecordFieldArray";
import type { SubstanceArticle, EffectEntry } from "../../../../schema";

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
}

export function EffectCategoryCard({
  fieldPath,
  title,
  icon,
  idPrefix,
  optional = false,
  noteFieldPath,
}: EffectCategoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { register } = useFormContext<SubstanceArticle>();
  
  const { fields, append, remove, updateKey, move } = useRecordFieldArray(fieldPath);

  const handleAddSubcategory = useCallback(() => {
    const newKey = `New Subcategory ${fields.length + 1}`;
    append({ key: newKey, note: "", effects: [] });
  }, [fields.length, append]);

  // Check if there are any subcategories
  const hasContent = fields.length > 0;
  
  // For optional sections, show a minimal state when empty
  if (optional && !hasContent && !isExpanded) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-4">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Icon icon={icon} className="h-4 w-4 text-white/40" size={16} />
            <span className="text-sm font-medium text-white/50">{title}</span>
            <span className="text-xs text-white/30">(optional)</span>
          </div>
          <Icon icon="lucide:chevron-right" className="h-4 w-4 text-white/40" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <Icon icon={icon} className="h-5 w-5 text-fuchsia-300" size={20} />
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className="text-xs text-white/40">
            ({fields.length} subcategor{fields.length === 1 ? "y" : "ies"})
          </span>
          {optional && fields.length === 0 && (
            <span className="text-xs text-white/30">(optional)</span>
          )}
        </div>
        {isExpanded ? (
          <Icon icon="lucide:chevron-down" className="h-4 w-4 text-white/40" size={16} />
        ) : (
          <Icon icon="lucide:chevron-right" className="h-4 w-4 text-white/40" size={16} />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
          {/* Category-level note at top of section */}
          {noteFieldPath && (
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-${title.toLowerCase().replace(/\s+/g, "-")}-note`}>
                {title} Note
              </Label>
              <Textarea
                id={`${idPrefix}-${title.toLowerCase().replace(/\s+/g, "-")}-note`}
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
                  key={field.key}
                  fieldPath={fieldPath}
                  subcategoryKey={field.key}
                  index={index}
                  totalCount={fields.length}
                  idPrefix={`${idPrefix}-${title.toLowerCase().replace(/\s+/g, "-")}`}
                  onRemove={() => remove(field.key)}
                  onMoveUp={() => move(index, index - 1)}
                  onMoveDown={() => move(index, index + 1)}
                  onKeyChange={(newKey) => updateKey(field.key, newKey)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/40 italic py-2 text-center">
              No subcategories added yet.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleAddSubcategory}
            className="w-full border-dashed"
          >
            <Icon icon="lucide:plus" className="h-4 w-4 mr-2" size={16} />
            Add Subcategory
          </Button>
        </div>
      )}
    </div>
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
  onKeyChange: (newKey: string) => void;
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
