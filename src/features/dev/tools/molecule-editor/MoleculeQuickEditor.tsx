"use client";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import {
  ConfirmDialog,
  EditorActionStatus,
  Notice,
  EditorStatusPill,
} from "@/features/dev/components";
import { OclEditor } from "./OclEditor";
import type { InchiComparison } from "./stereoGuard";
import { useMoleculeQuickEditorLifecycle } from "./useMoleculeQuickEditorLifecycle";

export type MoleculeQuickEditorProps = {
  slug: string;
  className?: string;
};


export function MoleculeQuickEditor({ slug, className }: MoleculeQuickEditorProps) {
  const {
    ocl,
    oclError,
    rdkit,
    rdkitError,
    source,
    setEdited,
    boldBonds,
    setBoldBonds,
    smiles,
    computing,
    noStructure,
    previewSvg,
    guard,
    saving,
    saveResult,
    dismissSaveResult,
    canvasError,
    setCanvasError,
    confirmRevert,
    dismissRevert,
    loadTimedOut,
    overrideRead,
    reloadOverride,
    dirty,
    canSave,
    loadedFromOverride,
    save,
    applyRevert,
    revertToAuto,
  } = useMoleculeQuickEditorLifecycle({ slug });
  const guardMismatch = guard != null && !guard.match;
  const overrideFailed = overrideRead.status === "failed";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="theme-text-faint text-xs">
          <span className="theme-text-muted font-mono">{slug}</span>
          {!noStructure && !overrideFailed ? (
            <>
              {" · "}
              <span>{loadedFromOverride ? "saved depiction" : "unsaved auto layout"}</span>
            </>
          ) : null}
        </span>
        <span className="ml-auto">
          {oclError || rdkitError ? (
            <EditorStatusPill tone="danger" icon="lucide:circle-alert">
              renderer failed
            </EditorStatusPill>
          ) : ocl && rdkit ? (
            <EditorStatusPill tone="success" icon="lucide:check">
              renderer ready
            </EditorStatusPill>
          ) : (
            <EditorStatusPill tone="neutral" loading live>
              loading renderer
            </EditorStatusPill>
          )}
        </span>
      </div>

      {oclError || rdkitError ? (
        <Notice
          tone="danger" title="Renderer unavailable" message="The molecule renderer failed to load, so previews and saving are disabled. Reload the page to retry." icon="lucide:circle-alert"
        />
      ) : canvasError ? (
        <Notice
          tone="danger" title="Editor unavailable" message="The structure editor failed to load, so changes can't be saved. Reload the page to retry." icon="lucide:circle-alert"
        />
      ) : null}

      {overrideRead.status === "failed" ? (
        <Notice
          tone="danger"
          title="Couldn't load depiction"
          message={overrideRead.error}
          actions={(
            <Button variant="outline" size="sm" onClick={reloadOverride}>
              <Icon icon="lucide:rotate-cw" size={14} />
              Try again
            </Button>
          )}
        />
      ) : null}

      <div className="space-y-4 lg:flex lg:items-start lg:gap-5 lg:space-y-0">
        <div className="relative h-[24rem] min-h-[20rem] w-full overflow-hidden rounded-xl border border-dose-border bg-dose-body lg:min-w-0 lg:flex-1">
          {overrideFailed ? (
            <UnreadableDepiction />
          ) : noStructure ? (
            <NoStructure />
          ) : (
            <>
              <ErrorBoundary
                name="molecule-editor-canvas"
                resetKeys={[source]}
                className="absolute inset-3 grid place-items-center overflow-auto"
              >
                <OclEditor
                  source={source}
                  onChange={setEdited}
                  onError={setCanvasError}
                  fineRotation
                  boldBonds={boldBonds}
                  onBoldBondsChange={setBoldBonds}
                  className="absolute inset-3 overflow-hidden rounded-lg"
                />
              </ErrorBoundary>
              {computing ? (
                <div className="theme-text-faint absolute inset-0 grid place-items-center bg-dose-surface-muted/70 p-4 text-center text-sm">
                  {loadTimedOut ? (
                    <span>
                      The depiction data hasn&apos;t arrived. Check the connection and reload
                      to retry.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Icon icon="lucide:loader-2" size={15} className="animate-spin" />
                      Loading molecule
                    </span>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-x-6 gap-y-4 lg:w-56 lg:shrink-0 lg:flex-col lg:items-stretch">
          <PreviewBox svg={previewSvg} ready={!!ocl} error={!!oclError} />
          <GuardRow guard={guard} hasReference={!!smiles} active={!noStructure} />

          <div className="ml-auto flex flex-col items-stretch gap-2 sm:items-end lg:ml-0 lg:items-stretch">
            <div className="flex min-h-6 items-center sm:justify-end lg:justify-start">
              {!noStructure && (saving || dirty) ? (
                <EditorActionStatus status={saving ? "saving" : "dirty"} />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
              <Button
                variant="outline"
                onClick={revertToAuto}
                disabled={noStructure || saving || overrideFailed}
                title="Regenerate from SMILES in the canvas; the public page changes only after Save"
              >
                <Icon icon="lucide:rotate-ccw" size={15} />
                Revert to auto
              </Button>
              <Button
                variant={guardMismatch ? "destructive" : "accent"}
                onClick={save}
                disabled={!canSave}
              >
                <Icon
                  icon={saving ? "lucide:loader-2" : "lucide:save"}
                  size={16}
                  className={saving ? "animate-spin" : undefined}
                />
                {guardMismatch ? "Save anyway" : "Save depiction"}
              </Button>
            </div>
            {guardMismatch ? (
              <p className="theme-danger-text max-w-xs text-xs sm:text-right lg:text-left">
                Saving publishes a depiction whose chemistry differs from the source structure.
              </p>
            ) : null}
          </div>

          {saveResult ? (
            <Notice
              className="w-full"
              tone={saveResult.tone}
              title={saveResult.title ?? (saveResult.tone === "success" ? "Saved" : "Couldn't save")}
              message={saveResult.message}
              actions={(
                <>
                  {saveResult.kind === "conflict" ? (
                    <Button variant="outline" size="sm" onClick={reloadOverride}>
                      <Icon icon="lucide:refresh-cw" size={14} />
                      Load the latest version
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={dismissSaveResult}>
                    Dismiss
                  </Button>
                </>
              )}
            />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        request={
          confirmRevert
            ? {
                title: "Discard unsaved edits?",
                description: "Reverting to the automatic layout will discard your unsaved changes.",
                confirmLabel: "Discard and revert",
                destructive: true,
                onConfirm: applyRevert,
              }
            : null
        }
        onClose={dismissRevert}
      />
    </div>
  );
}

function GuardRow({
  guard,
  hasReference,
  active,
}: {
  guard: InchiComparison | null;
  hasReference: boolean;
  active: boolean;
}) {
  const mismatch = guard != null && !guard.match;
  let pill = (
    <EditorStatusPill tone="neutral">{active ? "checking" : "no molecule"}</EditorStatusPill>
  );
  if (active && !hasReference) {
    pill = <EditorStatusPill tone="neutral">no reference SMILES</EditorStatusPill>;
  } else if (guard) {
    pill = guard.match ? (
      <EditorStatusPill tone="success" icon="lucide:shield-check" live>
        same molecule
      </EditorStatusPill>
    ) : (
      <EditorStatusPill tone="danger" icon="lucide:triangle-alert" live>
        molecule changed
      </EditorStatusPill>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-meta-label theme-text-faint">
        Stereo guard
      </span>
      <div>{pill}</div>
      {mismatch ? (
        <p className="theme-danger-text text-xs">
          Warning: this changed the actual molecule, not just the drawing.
        </p>
      ) : null}
    </div>
  );
}

function PreviewBox({
  svg,
  ready,
  error,
}: {
  svg: string | null;
  ready: boolean;
  error: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-meta-label theme-text-faint">
        Brand preview
      </span>
      <div className="grid h-24 w-24 place-items-center rounded-xl border border-dose-border bg-dose-surface-muted p-2">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : error ? (
          <span className="theme-danger-text text-center text-[11px] leading-tight">
            Renderer unavailable
          </span>
        ) : (
          <span className="theme-text-faint text-center text-[11px] leading-tight">
            {!ready ? "Loading" : "Rendering"}
          </span>
        )}
      </div>
    </div>
  );
}

function UnreadableDepiction() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-dose-surface-muted p-6">
      <div className="max-w-xs text-center">
        <div className="theme-danger-text mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-dose-body">
          <Icon icon="lucide:circle-alert" size={22} />
        </div>
        <p className="theme-text-primary font-medium">Saved depiction unreadable</p>
        <p className="theme-text-muted mt-1 text-sm">
          Editing and saving stay off so nothing replaces a depiction that couldn&apos;t be read. Try again above.
        </p>
      </div>
    </div>
  );
}

function NoStructure() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-dose-surface-muted p-6">
      <div className="max-w-xs text-center">
        <div className="theme-text-faint mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-dose-body">
          <Icon icon="lucide:flask-conical-off" size={22} />
        </div>
        <p className="theme-text-primary font-medium">No structure to edit</p>
        <p className="theme-text-muted mt-1 text-sm">
          This substance has no parseable SMILES, so there&apos;s no skeletal diagram to fix.
        </p>
      </div>
    </div>
  );
}
