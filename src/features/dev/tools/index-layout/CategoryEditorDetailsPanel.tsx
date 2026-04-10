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
    <div className="mt-2 w-full max-w-[380px] rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm text-white/75 shadow-inner shadow-black/20">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={categoryKeyId} className="text-xs uppercase tracking-wide text-white/60">Category key</label>
          <Input
            id={categoryKeyId}
            className="w-full"
            value={category.key}
            onChange={(event) => onFieldChange("key", event.target.value)}
            placeholder="Unique key"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={categoryIconId} className="text-xs uppercase tracking-wide text-white/60">Icon key</label>
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
        <label htmlFor={categoryNotesId} className="text-xs uppercase tracking-wide text-white/60">Editor notes</label>
        <Textarea
          id={categoryNotesId}
          className="min-h-[90px] w-full"
          value={category.notes ?? ""}
          onChange={(event) => onFieldChange("notes", event.target.value)}
          placeholder="Optional editor notes for this category"
        />
      </div>
    </div>
  );
}
