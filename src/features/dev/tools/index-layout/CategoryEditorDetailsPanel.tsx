import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ManualCategoryDefinition } from "./types";

interface CategoryEditorDetailsPanelProps {
  category: ManualCategoryDefinition;
  onFieldChange: (field: "key" | "iconKey" | "notes", value: string) => void;
}

export function CategoryEditorDetailsPanel({
  category,
  onFieldChange,
}: CategoryEditorDetailsPanelProps) {
  const categoryKeyId = useId();
  const categoryIconId = useId();
  const categoryNotesId = useId();

  return (
    <div className="theme-gradient-divider-before theme-text-secondary relative mt-2 w-full max-w-[380px] space-y-3 pt-4 text-sm before:absolute before:inset-x-0 before:top-0 before:h-px before:content-['']">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={categoryKeyId} className="theme-text-muted text-xs uppercase tracking-wide">Category key</label>
          <Input
            id={categoryKeyId}
            className="w-full"
            value={category.key}
            onChange={(event) => onFieldChange("key", event.target.value)}
            placeholder="Unique key"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={categoryIconId} className="theme-text-muted text-xs uppercase tracking-wide">Icon key</label>
          <Input
            id={categoryIconId}
            className="w-full"
            value={category.iconKey}
            onChange={(event) => onFieldChange("iconKey", event.target.value)}
            placeholder="Icon identifier"
          />
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <label htmlFor={categoryNotesId} className="theme-text-muted text-xs uppercase tracking-wide">Editor notes</label>
        <Textarea
          id={categoryNotesId}
          className="min-h-[90px] w-full"
          value={category.notes ?? ""}
          onChange={(event) => onFieldChange("notes", event.target.value)}
          placeholder="Optional editor notes for this category"
        />
        <p className="theme-text-faint text-xs">
          Editor-facing only, never rendered on /substances. The public category
          definition is a copy block (<code>{"substances-category-<key>"}</code>); edit it in
          Copy Studio.
        </p>
      </div>
    </div>
  );
}
