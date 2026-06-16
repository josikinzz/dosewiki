import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import {
  EditorActionGroup,
  EditorActionStatus,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";

interface LayoutToolbarProps {
  hasUnsavedChanges: boolean;
  saveNotice: string | null;
  showJsonEditor: boolean;
  onSave: () => void;
  onOrganize: () => void;
  onReset: () => void;
  onRestore: () => void;
  onToggleJson: () => void;
}

export function LayoutToolbar({
  hasUnsavedChanges,
  saveNotice,
  showJsonEditor,
  onSave,
  onOrganize,
  onReset,
  onRestore,
  onToggleJson,
}: LayoutToolbarProps) {
  return (
    <EditorToolbar label="Index layout actions">
      <EditorActionGroup label="Layout save actions">
        <Button
          variant="glass"
          size="sm"
          onClick={onSave}
          disabled={!hasUnsavedChanges}
          className="theme-accent-emphasis bg-[color-mix(in_srgb,#d946ef_20%,var(--theme-control-base))] hover:bg-[color-mix(in_srgb,#d946ef_30%,var(--theme-control-base))]"
          aria-label="Save layout"
        >
          <Icon icon="lucide:save" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Save</span>
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onReset}
          aria-label="Reset unsaved changes"
        >
          <Icon icon="lucide:rotate-ccw" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Reset draft</span>
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onRestore}
          aria-label="Restore original dataset"
        >
          <Icon icon="lucide:arrow-left-right" className="h-4 w-4" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Restore source</span>
        </Button>
      </EditorActionGroup>

      <EditorActionGroup label="Layout organization" separatorBefore>
        <Button
          variant="glass"
          size="sm"
          onClick={onOrganize}
          aria-label="Auto sort entries"
        >
          <Icon icon="lucide:arrow-down-a-z" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Auto-sort</span>
        </Button>
      </EditorActionGroup>

      <EditorActionGroup label="Layout view" separatorBefore>
        <Button
          variant="glass"
          size="sm"
          onClick={onToggleJson}
          aria-pressed={showJsonEditor}
          aria-label={showJsonEditor ? "Hide JSON editor" : "Show JSON editor"}
        >
          <Icon icon="lucide:braces" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">
            {showJsonEditor ? "Hide JSON" : "JSON view"}
          </span>
        </Button>
      </EditorActionGroup>

      {saveNotice || hasUnsavedChanges ? (
        <EditorActionGroup label="Layout status" separatorBefore>
          {saveNotice ? (
            <EditorStatusPill tone="success" live>
              {saveNotice}
            </EditorStatusPill>
          ) : null}
          {hasUnsavedChanges ? <EditorActionStatus status="dirty" /> : null}
        </EditorActionGroup>
      ) : null}
    </EditorToolbar>
  );
}
