import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EditorCheckbox,
  EditorField,
  EditorFieldRow,
  EditorPanel,
  EditorPanelBody,
} from "@/features/dev/components";

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
    <EditorPanel variant="subtle">
      <EditorPanelBody className="space-y-5">
      {/* Rename Form */}
      <form className="space-y-3" onSubmit={onRename}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide theme-accent-heading">Rename</span>
          <Icon icon="lucide:pencil" size={16} className="theme-icon-accent" />
        </div>
        <EditorField label="New label">
          <Input
            type="text"
            value={renameValue}
            placeholder="Enter new label"
            onChange={(event) => onRenameValueChange(event.target.value)}
          />
        </EditorField>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs theme-text-faint">
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

      <div className="h-px w-full bg-[image:var(--theme-horizontal-divider-image)]" />

      {/* Move Form */}
      <form className="space-y-3" onSubmit={onMove}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide theme-accent-heading">Move / Reclassify</span>
          <Icon icon="lucide:arrow-left-right" size={16} className="theme-icon-accent" />
        </div>
        <EditorFieldRow layout="twoColumn">
          <EditorField label="Destination field" htmlFor="move-target-field">
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
          </EditorField>
          <EditorField label="Optional rename" htmlFor="move-label">
            <Input
              id="move-label"
              type="text"
              value={moveLabel}
              onChange={(event) => onMoveLabelChange(event.target.value)}
              placeholder={selectedUsage.tag}
            />
          </EditorField>
        </EditorFieldRow>
        <EditorCheckbox
          checked={keepSourceCopy}
          onChange={(event) => onKeepSourceCopyChange(event.target.checked)}
          label={`Keep original tag in ${TAG_FIELD_LABELS[selectedUsage.field]}`}
          containerClassName="items-center"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs theme-text-faint">
            Moves or copies the tag to the chosen field and merges duplicates automatically.
          </p>
          <Button type="submit" variant="default" size="pill" className="rounded-full" disabled={isApplying}>
            {keepSourceCopy ? "Copy tag" : "Move tag"}
          </Button>
        </div>
      </form>

      <div className="h-px w-full bg-[image:var(--theme-horizontal-divider-image)]" />

      {/* Delete Zone */}
      <EditorPanel variant="danger">
        <EditorPanelBody className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--theme-danger-text-strong)]">
          <Icon icon="lucide:alert-triangle" className="h-4 w-4" size={16} />
          Danger zone
        </div>
        <p className="text-sm text-[color:var(--theme-danger-text)]">
          Removing this tag will delete it from every article where it appears. This cannot be undone unless you reset the
          dataset.
        </p>
        <EditorCheckbox
          tone="danger"
          checked={deleteConfirmed}
          onChange={(event) => onDeleteConfirmedChange(event.target.checked)}
          label="I understand this will permanently remove the tag."
          containerClassName="items-center"
        />
        <Button variant="destructivePill" size="pill" onClick={onDelete} disabled={isApplying || !deleteConfirmed}>
          <Icon icon="lucide:trash-2" size={16} />
          Delete tag everywhere
        </Button>
        </EditorPanelBody>
      </EditorPanel>
      </EditorPanelBody>
    </EditorPanel>
  );
}
