import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import {
  EditorActionGroup,
  EditorActionStatus,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";

/** The frosted strip stays the same on every pointer; only its stickiness follows `enableStickyPanels`. */
const TOOLBAR_SURFACE_CLASS =
  "rounded-xl border-b border-[color:var(--editor-toolbar-separator)] bg-[var(--editor-panel-bg)]/95 p-3 backdrop-blur";

interface LayoutToolbarProps {
  /** Sticky only for fine pointers; on a phone the toolbar scrolls with the board. */
  enableStickyPanels: boolean;
  hasUnsavedChanges: boolean;
  saveNotice: string | null;
  showJsonEditor: boolean;
  onSave: () => void;
  onOrganize: () => void;
  onReset: () => void;
  onRestore: () => void;
  onToggleJson: () => void;
  onAddCategory: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function LayoutToolbar({
  enableStickyPanels,
  hasUnsavedChanges,
  saveNotice,
  showJsonEditor,
  onSave,
  onOrganize,
  onReset,
  onRestore,
  onToggleJson,
  onAddCategory,
  onExpandAll,
  onCollapseAll,
}: LayoutToolbarProps) {
  return (
    <EditorToolbar
      label="Index layout actions"
      variant="wrap"
      className={cn(TOOLBAR_SURFACE_CLASS, enableStickyPanels && "sticky top-0 z-10")}
    >
      <EditorActionGroup label="Layout save actions">
        <Button
          variant="accent"
          size="sm"
          onClick={onSave}
          disabled={!hasUnsavedChanges}
          aria-label="Stage layout for the Convex save panel"
        >
          <Icon icon="lucide:save" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Stage</span>
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onReset}
          disabled={!hasUnsavedChanges}
          aria-label="Discard unsaved changes"
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
          onClick={onAddCategory}
          aria-label="Add category"
        >
          <Icon icon="lucide:plus-circle" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">New category</span>
        </Button>
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
          onClick={onExpandAll}
          aria-label="Expand all categories"
        >
          <Icon icon="lucide:chevrons-up-down" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Expand all</span>
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onCollapseAll}
          aria-label="Collapse all categories"
        >
          <Icon icon="lucide:chevrons-down-up" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Collapse all</span>
        </Button>
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
