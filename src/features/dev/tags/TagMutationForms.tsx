import { Icon } from "@/components/common/Icon";

import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { TAG_FIELD_LABELS, TAG_FIELDS, type TagField } from "@/utils/data/tagRegistry";
import type { TagMutationFormsProps } from "./types";

export function TagMutationForms({
  selectedUsage,
  renameValue,
  onRenameValueChange,
  onRename,
  moveTargetField,
  onMoveTargetFieldChange,
  moveLabel,
  onMoveLabelChange,
  keepSourceCopy,
  onKeepSourceCopyChange,
  onMove,
  deleteConfirmed,
  onDeleteConfirmedChange,
  onDelete,
  isApplying,
}: TagMutationFormsProps) {
  return (
    <SectionCard className="space-y-5 bg-white/[0.03]">
      {/* Rename Form */}
      <form className="space-y-3" onSubmit={onRename}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide text-white/60">Rename</span>
          <Icon icon="lucide:pencil" size={16} className="text-white/45" />
        </div>
        <Input
          type="text"
          value={renameValue}
          placeholder="Enter new label"
          onChange={(event) => onRenameValueChange(event.target.value)}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/55">
            Updates every occurrence of this tag across the dataset.
          </p>
          <Button
            type="submit"
            variant="default"
            size="pill"
            className="rounded-full"
            disabled={isApplying}
          >
            Rename tag
          </Button>
        </div>
      </form>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Move Form */}
      <form className="space-y-3" onSubmit={onMove}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide text-white/60">Move / Reclassify</span>
          <Icon icon="lucide:arrow-left-right" size={16} className="text-white/45" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="move-target-field">
              Destination field
            </label>
            <Select value={moveTargetField} onValueChange={(value) => onMoveTargetFieldChange(value as TagField)}>
              <SelectTrigger id="move-target-field" className="rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAG_FIELDS.filter((field) => field !== selectedUsage.field).map((field) => (
                  <SelectItem key={field} value={field}>
                    {TAG_FIELD_LABELS[field]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="move-label">
              Optional rename
            </label>
            <Input
              id="move-label"
              type="text"
              value={moveLabel}
              onChange={(event) => onMoveLabelChange(event.target.value)}
              placeholder={selectedUsage.tag}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/65">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/25 bg-slate-950/60 text-fuchsia-400 focus:ring-fuchsia-300/40"
            checked={keepSourceCopy}
            onChange={(event) => onKeepSourceCopyChange(event.target.checked)}
          />
          Keep original tag in {TAG_FIELD_LABELS[selectedUsage.field]}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/55">
            Moves or copies the tag to the chosen field and merges duplicates automatically.
          </p>
          <Button type="submit" variant="default" size="pill" className="rounded-full" disabled={isApplying}>
            {keepSourceCopy ? "Copy tag" : "Move tag"}
          </Button>
        </div>
      </form>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Delete Zone */}
      <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-200">
          <Icon icon="lucide:alert-triangle" className="h-4 w-4" size={16} />
          Danger zone
        </div>
        <p className="text-sm text-rose-100/80">
          Removing this tag will delete it from every article where it appears. This cannot be undone unless you reset the
          dataset.
        </p>
        <label className="flex items-center gap-2 text-xs text-rose-100/75">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-rose-300/50 bg-slate-950/60 text-rose-400 focus:ring-rose-300/40"
            checked={deleteConfirmed}
            onChange={(event) => onDeleteConfirmedChange(event.target.checked)}
          />
          I understand this will permanently remove the tag.
        </label>
        <Button variant="destructive" size="pill" className="rounded-full" onClick={onDelete} disabled={isApplying || !deleteConfirmed}>
          <Icon icon="lucide:trash-2" size={16} />
          Delete tag everywhere
        </Button>
      </div>
    </SectionCard>
  );
}
