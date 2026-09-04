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
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";

import { TAG_FIELD_LABELS, TAG_FIELDS, type TagField } from "@/utils/data/tagRegistry";
import { articleCount } from "./tagEditorStateMachine";
import { TagNotice } from "./TagNotice";
import type { NoticeSource, TagMutationFormsProps } from "./types";

export function TagMutationForms({
  selectedUsage,
  notice,
  undo,
  onUndo,
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
  const affected = articleCount(selectedUsage.count);
  const noticeFor = (source: NoticeSource) =>
    notice?.source === source ? (
      <TagNotice
        notice={notice}
        undo={undo?.source === source ? undo : null}
        onUndo={onUndo}
        busy={isApplying}
      />
    ) : null;

  return (
    <EditorSection
      icon="lucide:workflow"
      title="Bulk changes"
      description={`Each action below changes every article that carries "${selectedUsage.tag}" in ${TAG_FIELD_LABELS[selectedUsage.field]}. You can undo the last one until you make another change here.`}
      actions={<EditorStatusPill tone="warning">{affected}</EditorStatusPill>}
      delay={0.15}
    >
      <div className="space-y-5">
      {/* Rename Form */}
      <form className="space-y-3" onSubmit={onRename}>
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide theme-accent-heading">
          <Icon icon="lucide:pencil" size={16} className="theme-icon-accent" />
          Rename
        </span>
        <EditorField label="New label" htmlFor="tag-rename-label">
          <Input
            id="tag-rename-label"
            type="text"
            value={renameValue}
            placeholder="Enter new label"
            onChange={(event) => onRenameValueChange(event.target.value)}
          />
        </EditorField>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs theme-text-faint">
            Changes the label everywhere this tag appears.
          </p>
          <Button
            type="submit"
            variant="default"
            size="pill"
            className="rounded-full"
            disabled={isApplying}
          >
            Rename in {affected}
          </Button>
        </div>
        {noticeFor("rename")}
      </form>

      <div className="h-px w-full bg-[image:var(--theme-horizontal-divider-image)]" />

      {/* Move Form */}
      <form className="space-y-3" onSubmit={onMove}>
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide theme-accent-heading">
          <Icon icon="lucide:arrow-left-right" size={16} className="theme-icon-accent" />
          Move / Reclassify
        </span>
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
            {keepSourceCopy
              ? "Adds the tag to the chosen field and keeps it here. Articles that already carry it there are left as they are."
              : "Moves the tag to the chosen field. Articles that already carry it there are left as they are."}
          </p>
          <Button type="submit" variant="default" size="pill" className="rounded-full" disabled={isApplying}>
            {keepSourceCopy ? "Copy to" : "Move in"} {affected}
          </Button>
        </div>
        {noticeFor("move")}
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
          Removes this tag from all {affected} that carry it. You can undo from the notice that follows, until your next
          change here.
        </p>
        <EditorCheckbox
          tone="danger"
          checked={deleteConfirmed}
          onChange={(event) => onDeleteConfirmedChange(event.target.checked)}
          label={`I understand this removes the tag from ${affected}.`}
          containerClassName="items-center"
        />
        <Button variant="destructivePill" size="pill" onClick={onDelete} disabled={isApplying || !deleteConfirmed}>
          <Icon icon="lucide:trash-2" size={16} />
          Delete from {affected}
        </Button>
        {noticeFor("delete")}
        </EditorPanelBody>
      </EditorPanel>
      </div>
    </EditorSection>
  );
}
