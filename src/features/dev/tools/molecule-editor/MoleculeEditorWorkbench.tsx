"use client";

import { useId, useState, type ReactNode, type RefObject } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  EditorActionGroup,
  EditorCheckbox,
  EditorPanel,
  EditorStatusPill,
  EditorToolbar,
  Notice,
  SaveLine,
  type SaveLineCopy,
} from "@/features/dev/components";
import { KeyCap } from "@/features/dev/tools/glossary/workbenchParts";
import { RelativeDay } from "@/features/dev/tools/home/homeParts";
import { viewToPath } from "@/utils/routing";
import type { InchiComparison } from "./stereoGuard";
import type {
  MoleculeMirrorDirection,
  MoleculeSnapKind,
  MoleculeSnapOutcome,
} from "./moleculeTransforms";
import { MoleculeArticlePreview } from "./MoleculeArticlePreview";
import { OclEditor } from "./OclEditor";
import { OCL_KEY_LEGEND } from "./oclToolbar";
import {
  TracingControls,
  TracingOverlay,
  type TracingLayerState,
} from "./TracingLayer";
import type { EditorMode, MoleculeClassTemplate, SaveResult } from "./moleculeEditorTypes";
import {
  ChemistryChangePanel,
  MoleculeGuardStatus,
  MoleculePreview,
} from "./MoleculeEditorWorkbenchStatus";
import { depictionLabel, depictionSentence, type DepictionState } from "./moleculeListModel";

export const TEMPLATE_SAVE_COPY: SaveLineCopy = {
  label: "Saving stores the template. Nothing public changes.",
  detail: "A class template is private. It changes member depictions only when you apply it to the class and confirm.",
  icon: "lucide:layout-template",
  tone: "info",
};

export interface MoleculePaneRecord {
  title: string;
  slug: string;
  depiction: DepictionState;
  savedAt?: string | number | null;
  savedBy?: string | null;
  publiclyListed?: boolean;
}

interface MoleculeEditorWorkbenchProps {
  mode: EditorMode;
  record: MoleculePaneRecord;
  canvasSource: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onBackToList: () => void;
  engineStatus: "loading" | "ready" | "failed";
  lead?: ReactNode;
  startingPoints: ReactNode;
  noStructure: boolean;
  snapshotFailed: boolean;
  oclReady: boolean;
  oclError: string | null;
  rdkitError: string | null;
  canvasError: string | null;
  onCanvasError: (error: string | null) => void;
  source: string | null;
  sourceEpoch: number;
  atomLabels: Record<number, string> | undefined;
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
  saveBlocker: string | null;
  hasOverride: boolean;
  templateDoc: MoleculeClassTemplate | null | undefined;
  templatePreparing: boolean;
  canPrepareTemplate: boolean;
  onPrepareTemplate: () => void;
  onRevertToSaved: () => void;
  canRevertToSaved: boolean;
  onRequestRemove: () => void;
  onSave: () => void;
  saveKeyLabel: string;
  publishName: string | null;
  confirmName: string;
  onConfirmNameChange: (value: string) => void;
  saveResult: SaveResult | null;
  onDismissSaveResult: () => void;
  onLoadLatest: () => void;
}

export function MoleculeEditorWorkbench({
  mode,
  record,
  canvasSource,
  titleRef,
  onClose,
  onBackToList,
  engineStatus,
  lead,
  startingPoints,
  noStructure,
  snapshotFailed,
  oclReady,
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
  saveBlocker,
  hasOverride,
  templateDoc,
  templatePreparing,
  canPrepareTemplate,
  onPrepareTemplate,
  onRevertToSaved,
  canRevertToSaved,
  onRequestRemove,
  onSave,
  saveKeyLabel,
  publishName,
  confirmName,
  onConfirmNameChange,
  saveResult,
  onDismissSaveResult,
  onLoadLatest,
}: MoleculeEditorWorkbenchProps) {
  const headingId = useId();
  const blockerId = useId();
  const guardMismatch = guard != null && !guard.match;
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const [drawingOn, setDrawingOn] = useState(false);
  const hasCanvas = !noStructure && !snapshotFailed && !!record.slug;
  const drawingEnabled = hasCanvas && (!coarsePointer || drawingOn);
  const pickModes = drawingEnabled;

  const saveLabel = guardMismatch && publishName
    ? "Publish changed chemistry"
    : mode === "templates"
      ? "Save template"
      : mode === "classes"
        ? "Save class depiction"
        : "Save depiction";
  const savingLabel = mode === "templates" ? "Saving" : "Publishing";
  const noun = mode === "templates" ? "template" : mode === "classes" ? "class" : "substance";
  const conflict = saveResult?.kind === "conflict";

  return (
    <EditorPanel className="overflow-visible" role="region" aria-labelledby={headingId} data-testid="molecule-pane">
      <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label="Close structure"
          title="Close structure"
        >
          <Icon icon="lucide:x" size={18} />
        </Button>
        <div className="pr-12 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
        </div>
        <h3
          id={headingId}
          ref={titleRef}
          tabIndex={-1}
          className="theme-accent-heading min-w-0 break-words pr-12 text-xl font-semibold leading-tight outline-none"
        >
          <span className="sr-only">Editing </span>
          {record.title}
        </h3>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
          <span className="theme-text-muted font-mono text-xs">{mode === "substances" ? record.slug : `${noun}: ${record.slug}`}</span>
          <span aria-hidden className="theme-text-faint">·</span>
          <EditorStatusPill inline tone={record.depiction === "none" ? "warning" : record.depiction === "seeded" ? "neutral" : "success"}>
            {depictionLabel(record.depiction, mode)}
          </EditorStatusPill>
          {record.savedAt != null && record.depiction !== "none" ? (
            <span className="theme-text-faint text-xs">
              <SavedWhen at={record.savedAt} by={record.savedBy} />
            </span>
          ) : null}
          {mode === "substances" && record.publiclyListed === false ? (
            <span className="theme-text-faint text-xs">Not publicly listed</span>
          ) : null}
          {mode === "substances" ? (
            <a
              href={viewToPath({ type: "substance", slug: record.slug })}
              target="_blank"
              rel="noreferrer"
              className="theme-focus-ring theme-accent-underline inline-flex items-center gap-1 rounded-control text-xs font-medium text-dose-accent-strong underline-offset-4 hover:underline"
            >
              View live
              <Icon icon="lucide:arrow-up-right" size={12} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </p>
        <p className="theme-text-muted max-w-[70ch] text-sm">{depictionSentence(record.depiction, mode)}</p>
        {engineStatus !== "ready" ? (
          <p role="status" className={cn("flex items-center gap-2 text-xs", engineStatus === "failed" ? "theme-danger-text" : "theme-text-muted")}>
            <Icon
              icon={engineStatus === "failed" ? "lucide:circle-alert" : "lucide:loader-circle"}
              size={13}
              className={engineStatus === "loading" ? "motion-safe:animate-spin" : undefined}
            />
            {engineStatus === "failed" ? "The drawing engine did not load." : "Loading the drawing engine"}
          </p>
        ) : null}
      </header>

      <div className="space-y-8 px-4 py-5 sm:px-5 [&_:is(input,button)]:scroll-mb-48 [&_:is(input,button)]:scroll-mt-28">
        {oclError || rdkitError ? (
          <Notice
            tone="danger"
            title="Renderer unavailable"
            message="The molecule renderer failed to load, so previews and saving are off. Reload the page to try again."
            icon="lucide:circle-alert"
          />
        ) : canvasError ? (
          <Notice
            tone="danger"
            title="Editor unavailable"
            message="The structure editor failed to load, so changes cannot be saved. Reload the page to try again."
            icon="lucide:circle-alert"
          />
        ) : null}
        {lead}

        <section aria-labelledby={`${headingId}-drawing`} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 id={`${headingId}-drawing`} className="theme-text-primary text-base font-semibold">Drawing</h4>
            {hasCanvas ? (
              <p className="theme-text-faint text-xs" aria-live="polite">{canvasSource}</p>
            ) : null}
          </div>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_15rem] 2xl:items-start">
            <div className="min-w-0 space-y-3">
              {hasCanvas ? (
                <EditorToolbar label="Depiction adjustments" variant="compact" className="gap-y-2">
                  <EditorActionGroup label="Adjust" className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                    <span aria-hidden="true" className="type-meta-label theme-text-faint col-span-2 sm:col-span-1">
                      Adjust
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onMirrorDirectionChange("left-right")}
                      disabled={!canTransform}
                      title="Reflect this depiction across its vertical centre line"
                    >
                      <Icon icon="lucide:flip-horizontal-2" size={15} />
                      Flip left/right
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onMirrorDirectionChange("up-down")}
                      disabled={!canTransform}
                      title="Reflect this depiction across its horizontal centre line"
                    >
                      <Icon icon="lucide:flip-vertical-2" size={15} />
                      Flip up/down
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSnapRequestChange("straighten")}
                      disabled={!canTransform || snapRequest !== null}
                      title="Rotate the whole depiction the small amount needed to sit its bonds back on the standard 30° drawing grid"
                    >
                      <Icon icon="lucide:ruler" size={15} />
                      Straighten
                    </Button>
                    {pickModes ? (
                      <Button
                        variant={bondPickActive ? "pillActive" : "outline"}
                        size="sm"
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
                    {pickModes ? (
                      <Button
                        variant={boldToggleActive ? "pillActive" : "outline"}
                        size="sm"
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
                        <Icon icon={boldToggleActive ? "lucide:check" : "lucide:bold"} size={15} />
                        {boldToggleActive ? "Done with bold" : "Bold bonds"}
                      </Button>
                    ) : null}
                  </EditorActionGroup>
                </EditorToolbar>
              ) : null}

              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                className={cn(
                  "relative w-full overflow-hidden rounded-card border border-dose-border bg-dose-body",
                  noStructure || snapshotFailed ? "h-64" : coarsePointer ? "h-[min(64dvh,30rem)]" : "h-[clamp(24rem,calc(100dvh-23rem),44rem)]",
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
                  <ErrorBoundary
                    name="molecule-editor-canvas"
                    resetKeys={[source, sourceEpoch]}
                    className="absolute inset-3 grid place-items-center overflow-auto"
                  >
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
                      className="absolute inset-3"
                    >
                      {drawingEnabled ? (
                        <TracingOverlay layer={tracing} className="absolute inset-0 rounded-lg" />
                      ) : null}
                      {hasCanvas && coarsePointer && !drawingOn ? (
                        <TouchShield onDraw={() => setDrawingOn(true)} disabled={!canTransform} />
                      ) : null}
                    </OclEditor>
                  </ErrorBoundary>
                ) : null}
                {noStructure ? <NoStructureCanvas mode={mode} /> : null}
                {snapshotFailed ? <UnreadableSnapshotCanvas mode={mode} /> : null}
                {hasCanvas && computing ? (
                  <div className="theme-text-muted absolute inset-0 grid place-items-center bg-dose-surface-muted/70 text-sm">
                    <span role="status" className="inline-flex items-center gap-2">
                      <Icon icon="lucide:loader-circle" size={15} className="motion-safe:animate-spin" />
                      Loading the structure
                    </span>
                  </div>
                ) : null}
              </div>

              {hasCanvas && coarsePointer ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="theme-text-muted min-w-0 flex-1 text-xs">
                    {drawingOn
                      ? "Drawing: touches on the canvas edit the molecule. Scroll the page from outside it."
                      : "The canvas is locked so the page scrolls. Drawing works best with a mouse."}
                  </p>
                  <Button
                    type="button"
                    variant={drawingOn ? "pillActive" : "outline"}
                    size="sm"
                    aria-pressed={drawingOn}
                    disabled={!canTransform && !drawingOn}
                    onClick={() => {
                      if (drawingOn) {
                        onBondPickActiveChange(false);
                        onBoldToggleActiveChange(false);
                      }
                      setDrawingOn((value) => !value);
                    }}
                  >
                    <Icon icon={drawingOn ? "lucide:check" : "lucide:pencil"} size={15} />
                    {drawingOn ? "Done drawing" : "Draw on the canvas"}
                  </Button>
                </div>
              ) : null}

              {hasCanvas && drawingEnabled && mode === "classes" ? (
                <p className="theme-text-muted text-xs">
                  To place a labelled R position, pick Atom and type R plus the class&apos;s map number (R8 becomes Rα on phenethylamine).
                </p>
              ) : null}
            </div>

            <aside aria-label="Preview and canvas settings" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-1">
              <MoleculePreview
                svg={previewSvg}
                ready={oclReady}
                hasSelection={hasCanvas}
                error={!!oclError}
              />
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="type-meta-label theme-text-muted">Canvas</p>
                  <EditorCheckbox
                    checked={fineRotation}
                    onChange={(event) => onFineRotationChange(event.target.checked)}
                    disabled={!hasCanvas || renderBlocked}
                    label="Fine rotation"
                    description="Allow small free-angle adjustments below the editor's coarse rotation threshold."
                  />
                </div>
                <TracingControls layer={tracing} disabled={!drawingEnabled} />
              </div>
              <CanvasKeyLegend />
            </aside>
          </div>
        </section>

        {guardMismatch && hasCanvas && guard ? (
          <ChemistryChangePanel
            guard={guard}
            mode={mode}
            publishName={publishName}
            confirmName={confirmName}
            onConfirmNameChange={onConfirmNameChange}
          />
        ) : null}

        {startingPoints}

        {mode === "substances" && hasCanvas ? (
          <MoleculeArticlePreview slug={record.slug} svg={previewSvg} />
        ) : null}

        {mode !== "templates" ? (
          <div className="theme-portal-rule flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4">
            <p className="theme-text-muted max-w-[60ch] text-sm">
              {hasOverride
                ? mode === "classes"
                  ? "Removing deletes the saved class depiction; the class page goes back to its generic layout."
                  : "Removing deletes the saved depiction; the article shows no structure until one is saved again."
                : "Nothing is saved for this structure, so there is nothing to remove."}
            </p>
            <Button
              type="button"
              variant="ghostDestructive"
              size="sm"
              onClick={onRequestRemove}
              disabled={!hasOverride || saving}
            >
              <Icon icon="lucide:trash-2" size={15} />
              Remove override
            </Button>
          </div>
        ) : null}
      </div>

      <footer
        aria-label="Save"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        {saveResult ? (
          <Notice
            tone={saveResult.tone}
            title={saveResult.title ?? (saveResult.tone === "success" ? "Saved" : "Could not save")}
            message={saveResult.message}
            dismiss={onDismissSaveResult}
            className="text-sm"
            actions={conflict ? (
              <Button type="button" variant="outline" size="sm" onClick={onLoadLatest}>
                <Icon icon="lucide:refresh-cw" size={14} />
                Load the latest version
              </Button>
            ) : undefined}
          />
        ) : null}
        {hasCanvas ? (
          <MoleculeGuardStatus
            guard={guard}
            hasReference={mode === "templates" ? !!source : !!smiles}
            active={hasCanvas}
            mode={mode}
          />
        ) : null}
        {saveBlocker ? (
          <p id={blockerId} role="status" className={cn("text-sm", guardMismatch ? "theme-danger-text" : "theme-text-muted")}>
            {saveBlocker}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant={guardMismatch && canSave ? "destructive" : canSave ? "accent" : "outline"}
            size="sm"
            onClick={onSave}
            disabled={!canSave}
            aria-busy={saving || undefined}
            aria-describedby={saveBlocker ? blockerId : undefined}
            aria-keyshortcuts="Meta+S Control+S"
          >
            {saving ? <Icon icon="lucide:loader-circle" size={15} className="motion-safe:animate-spin" /> : null}
            {saving ? savingLabel : saveLabel}
            {saving ? null : <KeyCap>{saveKeyLabel}</KeyCap>}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRevertToSaved}
            disabled={!canRevertToSaved || saving}
            title="Reload the saved depiction and drop the changes on the canvas; nothing is published"
          >
            <Icon icon="lucide:undo-2" size={15} />
            Revert to saved
          </Button>
          {mode === "templates" && templateDoc ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPrepareTemplate}
              disabled={!canPrepareTemplate}
              title={
                dirty
                  ? "Save or revert template edits before building an apply preview"
                  : "Preview this saved template against every rolled class member"
              }
            >
              <Icon icon={templatePreparing ? "lucide:loader-circle" : "lucide:panels-top-left"} size={15} className={templatePreparing ? "motion-safe:animate-spin" : undefined} />
              Apply to class
            </Button>
          ) : null}
          <SaveState dirty={dirty} saving={saving} savingLabel={savingLabel} />
        </div>
        {mode === "templates" && templateDoc && dirty ? (
          <p className="theme-text-faint text-xs">Apply to class waits until the template edits are saved or reverted.</p>
        ) : null}
        <SaveLine model="instant" copy={mode === "templates" ? TEMPLATE_SAVE_COPY : undefined} />
      </footer>
    </EditorPanel>
  );
}

function SavedWhen({ at, by }: { at: string | number; by?: string | null }) {
  const date = new Date(typeof at === "number" ? at : Date.parse(at));
  if (Number.isNaN(date.getTime())) return null;
  return (
    <>
      <RelativeDay iso={date.toISOString()} prefix="Saved" />
      {by ? ` by ${by}` : null}
    </>
  );
}

function SaveState({ dirty, saving, savingLabel }: { dirty: boolean; saving: boolean; savingLabel: string }) {
  return (
    <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", dirty ? "theme-text-secondary" : "theme-text-faint")}>
      {saving ? (
        savingLabel
      ) : dirty ? (
        <>
          <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
          Unsaved changes
        </>
      ) : (
        "No changes yet"
      )}
    </p>
  );
}

function TouchShield({ onDraw, disabled }: { onDraw: () => void; disabled: boolean }) {
  return (
    <div data-testid="canvas-touch-shield" className="absolute inset-0 z-20 grid place-items-end justify-center p-3">
      <Button type="button" variant="outline" size="sm" onClick={onDraw} disabled={disabled} className="bg-[var(--editor-panel-bg)]/95 shadow-[var(--theme-elevation-lg)] backdrop-blur">
        <Icon icon="lucide:pencil" size={15} />
        Tap to draw
      </Button>
    </div>
  );
}

function CanvasKeyLegend() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <details className="group">
        <summary className="theme-focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control [@media(pointer:fine)]:min-h-8">
          <span id={headingId} className="type-meta-label theme-text-muted">Canvas keys</span>
          <Icon icon="lucide:chevron-down" size={14} className="theme-text-faint transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="mt-2 space-y-3 text-xs">
          <p className="theme-text-faint">With the canvas focused.</p>
          {OCL_KEY_LEGEND.map((group) => (
            <div key={group.target}>
              <p className="theme-text-muted font-medium">{group.target}</p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                {group.keys.map((entry) => (
                  <div key={entry.key} className="contents">
                    <dt>
                      <kbd className="theme-dev-kbd">{entry.key}</kbd>
                    </dt>
                    <dd className="theme-text-muted">{entry.action}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function UnreadableSnapshotCanvas({ mode }: { mode: EditorMode }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-dose-surface-muted p-6">
      <div className="max-w-xs text-center">
        <div className="theme-danger-text mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-dose-body">
          <Icon icon="lucide:circle-alert" size={22} />
        </div>
        <p className="theme-text-primary font-medium">
          {mode === "templates" ? "Saved template unreadable" : "Saved depiction unreadable"}
        </p>
        <p className="theme-text-muted mt-1 text-sm">
          Editing and saving stay off so nothing replaces a record that couldn&apos;t be read. Try again above.
        </p>
      </div>
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
          {mode === "templates" ? "Choose where this template starts" : "No structure to edit"}
        </p>
        <p className="theme-text-muted mt-1 text-sm">
          {mode === "templates"
            ? "Start from the class structure, pasted SMILES or a member's depiction, above."
            : "This record has no SMILES the editor can read, so there is nothing to draw. Start from pasted SMILES or another saved structure below."}
        </p>
      </div>
    </div>
  );
}

export function MoleculeIdlePane({ mode, loading }: { mode: EditorMode; loading: boolean }) {
  return (
    <EditorPanel variant="subtle" className="hidden space-y-3 px-5 py-6 lg:block" aria-busy={loading || undefined}>
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon={loading ? "lucide:loader-circle" : "lucide:hexagon"} size={18} className={cn("theme-icon-accent shrink-0", loading && "motion-safe:animate-spin")} />
        {loading ? "Loading the list" : mode === "templates" ? "Pick a class" : mode === "classes" ? "Pick a class" : "Pick a substance"}
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        {mode === "templates"
          ? "Its orientation template opens here on the canvas. Templates are private: they change members only when you apply one and confirm."
          : "Its drawing opens here on the canvas: move atoms, set wedge and hash bonds, flip, straighten or bold bonds, and check the result in the brand preview and the article before it goes live."}
      </p>
      <p className="theme-text-faint text-sm">
        To do lists the drawings nobody has checked yet. Press <kbd className="theme-dev-kbd">/</kbd> to find one.
      </p>
    </EditorPanel>
  );
}
