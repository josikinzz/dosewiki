import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="glass"
          size="sm"
          onClick={onSave}
          disabled={!hasUnsavedChanges}
          className="bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30"
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
      </div>
      <span className="hidden h-6 w-px bg-white/10 sm:inline-flex" aria-hidden="true" />
      <div className="flex items-center gap-2">
        <Button
          variant="glass"
          size="sm"
          onClick={onOrganize}
          aria-label="Auto sort entries"
        >
          <Icon icon="lucide:arrow-down-a-z" size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Auto-sort</span>
        </Button>
      </div>
      <span className="hidden h-6 w-px bg-white/10 sm:inline-flex" aria-hidden="true" />
      <div className="flex items-center gap-2">
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
      </div>
      {saveNotice && <span className="text-sm text-emerald-300">{saveNotice}</span>}
      {hasUnsavedChanges && <span className="text-sm text-white/60">Unsaved changes</span>}
    </div>
  );
}
