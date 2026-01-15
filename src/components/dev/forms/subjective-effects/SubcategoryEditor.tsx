/**
 * SubcategoryEditor - Edit a subcategory with its heading, note, and effects list.
 * Used within EffectCategoryCard and SenseCategoryCard.
 */

import { useCallback } from "react";
import { Icon } from "../../../common/Icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EffectEntryEditor } from "./EffectEntryEditor";
import type { EffectEntry } from "../../../../schema";

export interface SubcategoryEditorProps {
  /** The subcategory key/heading */
  subcategoryKey: string;
  /** The subcategory note */
  note: string;
  /** The effects in this subcategory */
  effects: EffectEntry[];
  /** Whether the heading is editable (false for fixed subcategories) */
  editableHeading?: boolean;
  /** Called when heading changes */
  onHeadingChange?: (newKey: string) => void;
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
      {/* Header row with heading, move buttons, and delete */}
      <div className="flex items-start gap-3">
        {/* Move buttons */}
        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col gap-1 pt-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="p-1 text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <Icon icon="lucide:chevron-up" className="h-4 w-4" size={16} />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="p-1 text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <Icon icon="lucide:chevron-down" className="h-4 w-4" size={16} />
            </button>
          </div>
        )}

        {/* Heading and note */}
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-subcat-${index}-heading`} className="text-xs text-white/50">
              Subcategory Name
            </Label>
            {editableHeading ? (
              <Input
                id={`${idPrefix}-subcat-${index}-heading`}
                value={subcategoryKey}
                onChange={(e) => onHeadingChange?.(e.target.value)}
                placeholder="e.g., Enhancements, Distortions, General..."
                className="font-medium"
              />
            ) : (
              <div className="text-sm font-semibold text-white/80 py-2">
                {subcategoryKey}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-subcat-${index}-note`} className="text-xs text-white/50">
              Note (optional)
            </Label>
            <Textarea
              id={`${idPrefix}-subcat-${index}-note`}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Brief qualitative description of effects in this subcategory..."
              className="min-h-[60px] resize-none text-sm"
              rows={2}
            />
          </div>
        </div>

        {/* Delete button */}
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
            title="Remove subcategory"
          >
            <Icon icon="lucide:trash-2" className="h-4 w-4" size={16} />
          </Button>
        )}
      </div>

      {/* Effects list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-white/50">
            Effects ({effects.length})
          </Label>
        </div>
        
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
          <p className="text-xs text-white/40 italic py-2">
            No effects added yet.
          </p>
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
