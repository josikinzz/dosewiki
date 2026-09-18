/**
 * SubcategoryEditor - Edit a subcategory with its heading, note, and effects list.
 * Used within EffectCategoryCard and SenseCategoryCard.
 */

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField } from "@/features/dev/components";
import { EffectEntryEditor } from "./EffectEntryEditor";
import { useGrowToContent } from "./useGrowToContent";
import type { EffectEntry } from "@/schema";

const SUBCATEGORY_MOVE_BUTTON_CLASS =
  `h-6 w-6 rounded p-1 text-[var(--theme-text-faint)] hover:bg-transparent disabled:opacity-30 disabled:cursor-not-allowed ${TOUCH_ICON}`;

export interface SubcategoryEditorProps {
  /** The subcategory key/heading */
  subcategoryKey: string;
  /** The subcategory note */
  note: string;
  /** The effects in this subcategory */
  effects: EffectEntry[];
  /** Whether the heading is editable (false for fixed subcategories) */
  editableHeading?: boolean;
  /** Change the stored key, or return a validation message without changing it. */
  onHeadingChange?: (newKey: string) => string | undefined;
  /** Called when note changes */
  onNoteChange: (note: string) => void;
  /** Called when effects change */
  onEffectsChange: (effects: EffectEntry[]) => void;
  /** Called when this subcategory should be removed */
  onRemove?: () => void;
  /** Called to move this subcategory up */
  onMoveUp?: () => void;
  /** Called to move this subcategory down */
  onMoveDown?: () => void;
  /** Whether move up is disabled */
  canMoveUp?: boolean;
  /** Whether move down is disabled */
  canMoveDown?: boolean;
  /** Prefix for input IDs */
  idPrefix: string;
  /** Index for accessibility */
  index: number;
}

export function SubcategoryEditor({
  subcategoryKey,
  note,
  effects,
  editableHeading = true,
  onHeadingChange,
  onNoteChange,
  onEffectsChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  idPrefix,
  index,
}: SubcategoryEditorProps) {
  const [heading, setHeading] = useState(subcategoryKey);
  const [headingError, setHeadingError] = useState<string>();
  useEffect(() => {
    setHeading(subcategoryKey);
  }, [subcategoryKey]);
  const noteField = useGrowToContent();

  const handleAddEffect = useCallback(() => {
    onEffectsChange([...effects, { name: "", description: "" }]);
  }, [effects, onEffectsChange]);

  const handleRemoveEffect = useCallback((effectIndex: number) => {
    onEffectsChange(effects.filter((_, i) => i !== effectIndex));
  }, [effects, onEffectsChange]);

  const handleEffectNameChange = useCallback((effectIndex: number, name: string) => {
    const updated = effects.map((effect, i) =>
      i === effectIndex ? { ...effect, name } : effect
    );
    onEffectsChange(updated);
  }, [effects, onEffectsChange]);

  const handleEffectDescChange = useCallback((effectIndex: number, description: string) => {
    const updated = effects.map((effect, i) =>
      i === effectIndex ? { ...effect, description } : effect
    );
    onEffectsChange(updated);
  }, [effects, onEffectsChange]);

  return (
    <div className="space-y-4">
      {index > 0 ? (
        <div className="theme-gradient-divider h-px" />
      ) : null}
      {/* Header row with heading, move buttons, and delete */}
      <div className="flex items-start gap-3">
        {/* Move buttons */}
        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col gap-1 pt-1">
            <Button
              type="button"
              variant="iconGhost"
              size="auto"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className={SUBCATEGORY_MOVE_BUTTON_CLASS}
              title="Move up"
              aria-label={`Move subcategory ${index + 1} up`}
            >
              <Icon icon="lucide:chevron-up" className="h-4 w-4" size={16} />
            </Button>
            <Button
              type="button"
              variant="iconGhost"
              size="auto"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className={SUBCATEGORY_MOVE_BUTTON_CLASS}
              title="Move down"
              aria-label={`Move subcategory ${index + 1} down`}
            >
              <Icon icon="lucide:chevron-down" className="h-4 w-4" size={16} />
            </Button>
          </div>
        )}

        {/* Heading and note */}
        <div className="min-w-0 flex-1 space-y-3">
          <EditorField
            htmlFor={`${idPrefix}-subcat-${index}-heading`}
            label="Subcategory Name"
            error={headingError}
            errorLive
          >
            {editableHeading ? (
              (controlProps) => (
                <Input
                  {...controlProps}
                  value={heading}
                  onChange={(event) => {
                    const next = event.target.value;
                    setHeading(next);
                    const error = onHeadingChange?.(next);
                    setHeadingError(error);
                    event.target.setCustomValidity(error ?? "");
                  }}
                  placeholder="e.g., Enhancements, Distortions, General..."
                  className="font-medium"
                />
              )
            ) : (
              <div
                id={`${idPrefix}-subcat-${index}-heading`}
                className="theme-text-secondary py-2 text-sm font-semibold"
              >
                {subcategoryKey}
              </div>
            )}
          </EditorField>

          <EditorField
            htmlFor={`${idPrefix}-subcat-${index}-note`}
            label="Note (optional)"
          >
            <Textarea
              id={`${idPrefix}-subcat-${index}-note`}
              ref={noteField.ref}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Brief qualitative description of effects in this subcategory..."
              textareaSize="sm"
              className="resize-none"
              rows={2}
            />
          </EditorField>
        </div>

        {/* Delete button */}
        {onRemove && (
          <Button
            type="button"
            variant="ghostDestructive"
            size="icon"
            onClick={onRemove}
            title="Remove subcategory"
            aria-label="Remove subcategory"
          >
            <Icon icon="lucide:trash-2" className="h-4 w-4" size={16} />
          </Button>
        )}
      </div>

      {/* Effects list */}
      <div className="space-y-2">
        <p className="theme-text-muted text-sm font-medium leading-5">
          Effects ({effects.length})
        </p>

        {effects.length > 0 ? (
          <div className="space-y-2">
            {effects.map((effect, effectIndex) => (
              <EffectEntryEditor
                key={`${idPrefix}-effect-${effectIndex}`}
                name={effect.name}
                description={effect.description}
                onNameChange={(name) => handleEffectNameChange(effectIndex, name)}
                onDescriptionChange={(desc) => handleEffectDescChange(effectIndex, desc)}
                onRemove={() => handleRemoveEffect(effectIndex)}
                idPrefix={`${idPrefix}-subcat-${index}`}
                index={effectIndex}
              />
            ))}
          </div>
        ) : (
          <EmptyStateSurface padding="sm" radius="md" className="theme-text-faint text-xs">
            No effects added yet.
          </EmptyStateSurface>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddEffect}
          className="w-full border-dashed"
        >
          <Icon icon="lucide:plus" className="h-3.5 w-3.5 mr-1.5" size={14} />
          Add Effect
        </Button>
      </div>
    </div>
  );
}
