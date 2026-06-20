/**
 * EffectEntryEditor - Edit a single effect entry (name + description).
 * Used within SubcategoryEditor to manage individual effects.
 */

import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="group relative flex gap-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-frosted-control-on-panel-bg)] p-3 transition hover:border-[var(--theme-frosted-panel-hover-border)]">
      {/* Effect name and description */}
      <div className="flex-1 space-y-2">
        <Input
          id={`${idPrefix}-effect-${index}-name`}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Effect name (e.g., Euphoria)"
          className="text-sm font-medium"
        />
        <Textarea
          id={`${idPrefix}-effect-${index}-desc`}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Optional description of how this effect manifests..."
          className="min-h-[60px] resize-none text-sm"
          rows={2}
        />
      </div>

      {/* Delete button */}
      <Button
        type="button"
        variant="ghostDestructive"
        size="icon"
        onClick={onRemove}
        className="h-8 w-8 shrink-0"
        aria-label={`Remove effect ${index + 1}`}
      >
        <Icon icon="lucide:x" className="h-4 w-4" size={16} />
      </Button>
    </div>
  );
}
