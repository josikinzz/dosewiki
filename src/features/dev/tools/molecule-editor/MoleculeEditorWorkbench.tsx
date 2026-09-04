import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  DesktopOnlyNotice,
  EditorActionStatus,
  EditorCheckbox,
  EditorNotice,
  EditorSection,
} from "@/features/dev/components";
import type { InchiComparison } from "./stereoGuard";
import type {
  MoleculeMirrorDirection,
  MoleculeSnapKind,
  MoleculeSnapOutcome,
} from "./moleculeTransforms";
import { OclEditor } from "./OclEditor";
import {
  TracingControls,
  TracingOverlay,
  type TracingLayerState,
} from "./TracingLayer";
import type { EditorMode, MoleculeClassTemplate, SaveResult } from "./moleculeEditorTypes";
import { MoleculeGuardStatus, MoleculePreview } from "./MoleculeEditorWorkbenchStatus";

interface MoleculeEditorWorkbenchProps {
  mode: EditorMode;
  selected: string | null;
  noStructure: boolean;
  oclReady: boolean;
  rdkitReady: boolean;
  oclError: string | null;
  rdkitError: string | null;
  canvasError: string | null;
  onCanvasError: (error: string | null) => void;
  source: string | null;
  sourceEpoch: number;
  /** Class-mode R-group display labels for the canvas, atom index -> "R2"/"Rα"/"RN". */
  atomLabels: Record<number, string> | undefined;
  /** Canvas emissions: stripped MOL block + the labels OCL currently displays. */
  onEditorChange: (molblock: string, displayedAtomLabels?: Record<number, string>) => void;
  fineRotation: boolean;
  onFineRotationChange: (enabled: boolean) => void;
  mirrorDirection: MoleculeMirrorDirection | null;
  onMirrorDirectionChange: (direction: MoleculeMirrorDirection | null) => void;
  snapRequest: MoleculeSnapKind | null;
  onSnapRequestChange: (request: MoleculeSnapKind | null) => void;
  onSnapComplete: (outcome: MoleculeSnapOutcome) => void;
  selectedBondCount: number;
  onSelectedBondCountChange: (count: number) => void;
  bondPickActive: boolean;
  onBondPickActiveChange: (active: boolean) => void;
  onBondPickComplete: (outcome: MoleculeSnapOutcome) => void;
  boldBonds: number[];
  onBoldBondsChange: (bonds: number[]) => void;
  boldToggleActive: boolean;
  onBoldToggleActiveChange: (active: boolean) => void;
  tracing: TracingLayerState;
  computing: boolean;
  previewSvg: string | null;
  guard: InchiComparison | null;
  smiles: string;
  saving: boolean;
  dirty: boolean;
  renderBlocked: boolean;
  canTransform: boolean;
  canSave: boolean;
  hasOverride: boolean;
  templateDoc: MoleculeClassTemplate | null | undefined;
  templatePreparing: boolean;
  onPrepareTemplate: () => void;
  onRevert: () => void;
  onRequestRemove: () => void;
  onSave: () => void;
  saveResult: SaveResult | null;
  onDismissSaveResult: () => void;
}

export function MoleculeEditorWorkbench({
  mode,
  selected,
  noStructure,
  oclReady,
  rdkitReady,
  oclError,
  rdkitError,
  canvasError,
  onCanvasError,
  source,
  sourceEpoch,
  atomLabels,
  onEditorChange,
  fineRotation,
  onFineRotationChange,
  mirrorDirection,
  onMirrorDirectionChange,
  snapRequest,
  onSnapRequestChange,
  onSnapComplete,
  selectedBondCount,
  onSelectedBondCountChange,
  bondPickActive,
  onBondPickActiveChange,
  onBondPickComplete,
  boldBonds,
  onBoldBondsChange,
  boldToggleActive,
  onBoldToggleActiveChange,
  tracing,
  computing,
  previewSvg,
  guard,
  smiles,
  saving,
  dirty,
  renderBlocked,
  canTransform,
  canSave,
  hasOverride,
  templateDoc,
  templatePreparing,
  onPrepareTemplate,
  onRevert,
  onRequestRemove,
  onSave,
  saveResult,
  onDismissSaveResult,
}: MoleculeEditorWorkbenchProps) {
  const guardMismatch = guard != null && !guard.match;
  // Drawing is desktop-only: OpenChemLib's toolbar, keyboard atom typing, and
  // click-to-pick bond modes have no touch equivalent. Mirrors the pointer query
  // `useDevChromeEnvironment` uses for sticky panels, inverted.
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const hasCanvas = !!selected && !noStructure;
  // The canvas stays mounted (invisible) on coarse pointers: it is the engine
  // behind flip / straighten and every emitted MOL block, not just the drawing UI.
  const drawingEnabled = hasCanvas && !coarsePointer;

  return (
    <EditorSection
      icon="lucide:pencil"
      title="Editor"
      delay={0.05}
      description={
        drawingEnabled ? (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon="lucide:lasso-select" size={13} className="shrink-0" />
            <span>
              Pick the lasso tool near the top of the toolbar to drag atoms. The default bond
              tool draws new bonds. Wedge / hash stereo tools live in the same toolbar.
              {mode === "classes"
                ? " To place a labeled R position, pick the ?… atom tool and type R plus the class's map number (e.g. R8 → Rα on phenethylamine)."
                : null}
            </span>
          </span>
        ) : undefined
      }
    >
      {oclError || rdkitError ? (
        <EditorNotice
          notice={{
            tone: "danger",
            title: "Renderer unavailable",
            message:
              "The molecule renderer failed to load, so previews and saving are disabled. Reload the page to retry.",
            icon: "lucide:circle-alert",
          }}
        />
      ) : canvasError ? (
        <EditorNotice
          notice={{
            tone: "danger",
            title: "Editor unavailable",
            message:
              "The structure editor failed to load, so changes can't be saved. Reload the page to retry.",
            icon: "lucide:circle-alert",
          }}
        />
      ) : null}

      <div className="space-y-4 xl:flex xl:items-start xl:gap-6 xl:space-y-0">
        {/* Drag-and-drop duplicates the accessible tracing file picker. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-xl border border-dose-border bg-dose-body xl:min-w-0 xl:flex-1",
            coarsePointer ? "h-64" : "h-[60vh] min-h-[30rem]",
          )}
          onDragOver={(event) => {
            if (drawingEnabled) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!drawingEnabled) return;
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) tracing.loadFile(file);
          }}
        >
          {hasCanvas ? (
            <OclEditor
              source={source}
              sourceEpoch={sourceEpoch}
              atomLabels={atomLabels}
              onChange={onEditorChange}
              onError={onCanvasError}
              fineRotation={fineRotation}
              mirrorDirection={mirrorDirection}
              onMirrorComplete={() => onMirrorDirectionChange(null)}
              snapRequest={snapRequest}
              onSnapComplete={onSnapComplete}
              onSelectedBondCountChange={onSelectedBondCountChange}
              bondPickActive={bondPickActive}
              onBondPickComplete={onBondPickComplete}
              boldBonds={boldBonds}
              boldToggleActive={boldToggleActive}
              onBoldBondsChange={onBoldBondsChange}
              onBoldToggleExit={() => onBoldToggleActiveChange(false)}
              className={cn(
                "absolute inset-3 overflow-hidden rounded-lg",
                coarsePointer && "invisible",
              )}
            />
          ) : null}
          {coarsePointer ? (
            <DesktopOnlyCanvas />
          ) : !selected ? (
            <EmptyCanvas />
          ) : noStructure ? (
            <NoStructureCanvas mode={mode} />
          ) : (
            <TracingOverlay layer={tracing} className="absolute inset-3 rounded-lg" />
          )}
          {hasCanvas && computing ? (
            <div className="theme-text-faint absolute inset-0 grid place-items-center bg-dose-surface-muted/70 text-sm">
              <span className="inline-flex items-center gap-2">
                <Icon icon="lucide:loader-2" size={15} className="animate-spin" />
                Loading molecule…
              </span>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "flex flex-wrap items-start gap-x-6 gap-y-4 rounded-xl border border-dose-border bg-dose-surface-muted p-4 xl:static xl:w-64 xl:shrink-0 xl:flex-col xl:items-stretch xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0",
            !coarsePointer && "sticky bottom-0 z-10",
          )}
        >
          <MoleculePreview
            svg={previewSvg}
            ready={oclReady}
            hasSelection={!!selected}
            error={!!oclError}
          />
          <MoleculeGuardStatus
            guard={guard}
            hasReference={mode === "templates" ? !!source : !!smiles}
            active={!!selected && !noStructure}
            mode={mode}
          />
          {!coarsePointer ? (
            <>
              <div className="min-w-52 space-y-2 xl:min-w-0">
                <p className="theme-text-faint text-sm font-medium uppercase tracking-wide">Editor settings</p>
                <EditorCheckbox
                  checked={fineRotation}
                  onChange={(event) => onFineRotationChange(event.target.checked)}
                  disabled={!hasCanvas || renderBlocked}
                  label="Fine rotation"
                  description="Allow small free-angle adjustments below the editor's coarse rotation threshold."
                />
              </div>
              <div className="min-w-52 xl:min-w-0">
                <TracingControls layer={tracing} disabled={!hasCanvas} />
              </div>
            </>
          ) : null}
          <div className="ml-auto flex flex-col items-stretch gap-2 sm:items-end xl:ml-0 xl:items-stretch">
            <div className="flex min-h-6 items-center sm:justify-end xl:justify-start">
              {selected && !noStructure && (saving || dirty) ? (
                <EditorActionStatus status={saving ? "saving" : "dirty"} />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
              {mode !== "templates" ? (
                <Button
                  variant="outline"
                  onClick={onRevert}
                  disabled={!selected || noStructure || saving}
                  title="Regenerate from SMILES in the canvas; the public page changes only after Save"
                >
                  <Icon icon="lucide:rotate-ccw" size={15} />
                  Revert to auto
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => onMirrorDirectionChange("left-right")}
                disabled={!canTransform}
                title="Reflect this depiction across its vertical centre line"
              >
                <Icon icon="lucide:flip-horizontal-2" size={15} />
                Flip left/right
              </Button>
              <Button
                variant="outline"
                onClick={() => onMirrorDirectionChange("up-down")}
                disabled={!canTransform}
                title="Reflect this depiction across its horizontal centre line"
              >
                <Icon icon="lucide:flip-vertical-2" size={15} />
                Flip up/down
              </Button>
              {!coarsePointer ? (
                <Button
                  variant={bondPickActive ? "accent" : "outline"}
                  aria-pressed={bondPickActive}
                  onClick={() => {
                    if (bondPickActive) {
                      onBondPickActiveChange(false);
                    } else if (selectedBondCount === 1) {
                      onSnapRequestChange("bond-vertical");
                    } else {
                      onBoldToggleActiveChange(false);
                      onBondPickActiveChange(true);
                    }
                  }}
                  disabled={!canTransform || snapRequest !== null}
                  title={
                    bondPickActive
                      ? "Click a bond on the canvas, or press Esc to cancel"
                      : selectedBondCount === 1
                        ? "Rotate the whole depiction so the selected bond is exactly vertical"
                        : "Then click a bond on the canvas; the whole depiction rotates so that bond is exactly vertical"
                  }
                >
                  <Icon icon={bondPickActive ? "lucide:x" : "lucide:align-center-vertical"} size={15} />
                  {bondPickActive ? "Cancel bond pick" : "Set bond vertical"}
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => onSnapRequestChange("straighten")}
                disabled={!canTransform || snapRequest !== null}
                title="Rotate the whole depiction the small amount needed to sit its bonds back on the standard 30° drawing grid"
              >
                <Icon icon="lucide:ruler" size={15} />
                Straighten
              </Button>
              {!coarsePointer ? (
                <Button
                  variant={boldToggleActive ? "accent" : "outline"}
                  aria-pressed={boldToggleActive}
                  onClick={() => {
                    if (boldToggleActive) {
                      onBoldToggleActiveChange(false);
                    } else {
                      onBondPickActiveChange(false);
                      onBoldToggleActiveChange(true);
                    }
                  }}
                  disabled={!canTransform || snapRequest !== null}
                  title={
                    boldToggleActive
                      ? "Click bonds on the canvas to toggle bold; press Esc or this button to finish"
                      : mode === "templates"
                        ? "Then click bonds on the canvas to draw them thicker while editing; applies copy coordinates, never bold"
                        : "Then click bonds on the canvas to draw them thicker, on the canvas, the preview, and the article alike"
                  }
                >
                  <Icon icon={boldToggleActive ? "lucide:x" : "lucide:bold"} size={15} />
                  {boldToggleActive ? "Done with bold" : "Bold bonds"}
                </Button>
              ) : null}
              {mode === "classes" ? (
                <Button
                  variant="ghostDestructive"
                  onClick={onRequestRemove}
                  disabled={!hasOverride || saving}
                  title="Delete the saved class override and return to its static fallback"
                >
                  <Icon icon="lucide:trash-2" size={15} />
                  Remove override
                </Button>
              ) : null}
              {mode === "templates" && templateDoc ? (
                <Button
                  variant="outline"
                  onClick={onPrepareTemplate}
                  disabled={dirty || saving || !rdkitReady || !oclReady || templatePreparing}
                  title={
                    dirty
                      ? "Save or discard template edits before building an apply preview"
                      : "Preview this saved template against every rolled class member"
                  }
                >
                  <Icon icon="lucide:panels-top-left" size={16} />
                  Apply to class…
                </Button>
              ) : null}
              <Button variant={guardMismatch ? "destructive" : "accent"} onClick={onSave} disabled={!canSave}>
                <Icon
                  icon={saving ? "lucide:loader-2" : "lucide:save"}
                  size={16}
                  className={saving ? "animate-spin" : undefined}
                />
                {guardMismatch
                  ? "Save anyway"
                  : mode === "templates"
                    ? "Save template"
                    : mode === "classes"
                      ? "Save override"
                      : "Save depiction"}
              </Button>
            </div>
            {guardMismatch ? (
              <p className="theme-danger-text max-w-xs text-sm sm:text-right xl:text-left">
                Saving publishes a depiction whose chemistry differs from the source structure.
              </p>
            ) : null}
          </div>

          {saveResult ? (
            <EditorNotice
              className="w-full"
              notice={{
                tone: saveResult.tone,
                title:
                  saveResult.title ??
                  (saveResult.tone === "success" ? "Saved" : "Couldn't save"),
                message: saveResult.message,
                live: true,
                actions: (
                  <Button variant="outline" size="sm" onClick={onDismissSaveResult}>
                    Dismiss
                  </Button>
                ),
              }}
            />
          ) : null}
        </div>
      </div>
    </EditorSection>
  );
}

function EmptyCanvas() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-dose-surface-muted p-6">
      <div className="max-w-xs text-center">
        <div className="theme-text-faint mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-dose-body">
          <Icon icon="lucide:hexagon" size={22} />
        </div>
        <p className="theme-text-primary font-medium">Select a structure</p>
        <p className="theme-text-muted mt-1 text-sm">
          Pick a substance or class from the dropdown above to load its structure, then fix its atom positions and wedge / hash stereo bonds.
        </p>
      </div>
    </div>
  );
}

function DesktopOnlyCanvas() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-dose-surface-muted p-6">
      <DesktopOnlyNotice className="max-w-md" title="Drawing is desktop-only" />
    </div>
  );
}

function NoStructureCanvas({ mode }: { mode: EditorMode }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-dose-surface-muted p-6">
      <div className="max-w-xs text-center">
        <div className="theme-text-faint mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-dose-body">
          <Icon icon="lucide:flask-conical-off" size={22} />
        </div>
        <p className="theme-text-primary font-medium">
          {mode === "templates" ? "Initialize this template" : "No structure to edit"}
        </p>
        <p className="theme-text-muted mt-1 text-sm">
          {mode === "templates"
            ? "Start from pasted SMILES or a current member depiction using the controls above."
            : "This selection has no parseable structure, so there's no skeletal diagram to fix."}
        </p>
      </div>
    </div>
  );
}
