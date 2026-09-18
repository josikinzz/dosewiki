/**
 * EffectEntryEditor - Edit a single effect entry (name + description).
 * Used within SubcategoryEditor to manage individual effects.
 */

import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField } from "@/features/dev/components";
import { useGrowToContent } from "./useGrowToContent";

export interface EffectEntryEditorProps {
  /** The effect name */
  name: string;
  /** The effect description */
  description: string;
  /** Called when name changes */
  onNameChange: (name: string) => void;
  /** Called when description changes */
  onDescriptionChange: (description: string) => void;
  /** Called when delete button is clicked */
  onRemove: () => void;
  /** Prefix for input IDs */
  idPrefix: string;
  /** Index for accessibility */
  index: number;
}

export function EffectEntryEditor({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onRemove,
  idPrefix,
  index,
}: EffectEntryEditorProps) {
  const descriptionField = useGrowToContent();

  return (
    <div className="group relative flex gap-2 rounded-lg border border-[var(--theme-border-subtle)] [background:var(--theme-frosted-control-on-panel-bg)] p-3 transition hover:border-[var(--theme-frosted-panel-hover-border)]">
      {/* Effect name and description */}
      <div className="min-w-0 flex-1 space-y-3">
        <EditorField htmlFor={`${idPrefix}-effect-${index}-name`} label="Effect name">
          <Input
            id={`${idPrefix}-effect-${index}-name`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Effect name (e.g., Euphoria)"
            className="font-medium"
          />
        </EditorField>
        <EditorField htmlFor={`${idPrefix}-effect-${index}-desc`} label="Description (optional)">
          <Textarea
            id={`${idPrefix}-effect-${index}-desc`}
            ref={descriptionField.ref}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Optional description of how this effect manifests..."
            className="min-h-[60px] resize-none"
            rows={2}
          />
        </EditorField>
      </div>

      {/* Delete button */}
      <Button
        type="button"
        variant="ghostDestructive"
        size="auto"
        onClick={onRemove}
        className={`h-8 w-8 shrink-0 ${TOUCH_ICON}`}
        aria-label={`Remove effect ${index + 1}`}
      >
        <Icon icon="lucide:x" className="h-4 w-4" size={16} />
      </Button>
    </div>
  );
}
