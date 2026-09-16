"use client";

/**
 * Slim, embeddable molecule depiction editor — the substance-mode core of
 * `MoleculeEditorTab` pre-bound to a single slug, with no picker, no mode tabs, no
 * class/template machinery, and no section chrome (the host supplies the panel).
 *
 * Same data flow as the full tab:
 *   • the editable record is read through the editor-gated `/api/dev/molecule-override`
 *     GET, so it round-trips against the same deployment that receives the save
 *   • the reference SMILES comes from `substanceIndex.getBySlug` (`identification.smiles`)
 *   • with no published row (or after Revert to auto) the starting structure is a local
 *     `smilesToMolblock` auto layout — Revert is canvas-only until Save
 *   • `source` is the MOL block fed INTO the canvas, `edited` the live MOL block coming
 *     OUT of it (drives preview, stereo guard, dirty state, and the save payload)
 *   • Save POSTs `{ slug, molblock, svg, smiles }` and then re-reads the published row
 *
 * The host must provide a DataProvider and an authenticated editor session.
 */
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EditorActionStatus,
  EditorNotice,
  EditorStatusPill,
} from "@/features/dev/components";
import { OclEditor } from "./OclEditor";
import type { InchiComparison } from "./stereoGuard";
import { useMoleculeQuickEditorLifecycle } from "./useMoleculeQuickEditorLifecycle";

export type MoleculeQuickEditorProps = {
  /** Substance slug whose depiction is being edited. */
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
    overrideLoadError,
    dirty,
    canSave,
    loadedFromOverride,
    save,
    applyRevert,
    revertToAuto,
  } = useMoleculeQuickEditorLifecycle({ slug });
  const guardMismatch = guard != null && !guard.match;

  return (
    <div className={cn("space-y-4", className)}>
      {/* ---- header row: provenance + renderer status ------------------------ */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="theme-text-faint text-xs">
          <span className="theme-text-muted font-mono">{slug}</span>
          {!noStructure ? (
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

      {/* fatal renderer / editor failures go first so the tall canvas never hides them */}
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

      {overrideLoadError ? (
        <EditorNotice
          notice={{
            tone: "danger",
            title: "Couldn't load depiction",
            message: overrideLoadError,
            live: true,
          }}
        />
      ) : null}

      {/* ---- canvas + control rail ------------------------------------------ */}
      <div className="space-y-4 lg:flex lg:items-start lg:gap-5 lg:space-y-0">
        <div className="relative h-[24rem] min-h-[20rem] w-full overflow-hidden rounded-xl border border-dose-border bg-dose-body lg:min-w-0 lg:flex-1">
          {noStructure ? (
            <NoStructure />
          ) : (
            <>
              {/* inset so OpenChemLib's white canvas reads as matted artwork inside
                  the dark frame rather than an edge-to-edge white slab */}
              <OclEditor
                source={source}
                onChange={setEdited}
                onError={setCanvasError}
                fineRotation
                boldBonds={boldBonds}
                onBoldBondsChange={setBoldBonds}
                className="absolute inset-3 overflow-hidden rounded-lg"
              />
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
                      Loading molecule…
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
            {/* fixed-height slot so the status pill appearing doesn't shift the buttons */}
            <div className="flex min-h-6 items-center sm:justify-end lg:justify-start">
              {!noStructure && (saving || dirty) ? (
                <EditorActionStatus status={saving ? "saving" : "dirty"} />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
              <Button
                variant="outline"
                onClick={revertToAuto}
                disabled={noStructure || saving}
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
            <EditorNotice
              className="w-full"
              notice={{
                tone: saveResult.tone,
                title: saveResult.tone === "success" ? "Saved" : "Couldn't save",
                message: saveResult.message,
                live: true,
                actions: (
                  <Button variant="outline" size="sm" onClick={dismissSaveResult}>
                    Dismiss
                  </Button>
                ),
              }}
            />
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirmRevert}
        onOpenChange={(open) => {
          if (!open) dismissRevert();
        }}
      >
        <DialogContent className="max-w-md" showClose={false}>
          <DialogHeader>
            <DialogTitle>Discard unsaved edits?</DialogTitle>
            <DialogDescription className="theme-text-muted">
              Reverting to the automatic layout will discard your unsaved changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={dismissRevert}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={applyRevert}>
              Discard and revert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
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
    <EditorStatusPill tone="neutral">{active ? "checking…" : "no molecule"}</EditorStatusPill>
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
      <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
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
      <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
        Brand preview
      </span>
      <div className="grid h-24 w-24 place-items-center rounded-xl border border-dose-border bg-dose-surface-muted p-2">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain"
            // OpenChemLib output rendered from our own MOL block (editor preview).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : error ? (
          <span className="theme-danger-text text-center text-[11px] leading-tight">
            Renderer unavailable
          </span>
        ) : (
          <span className="theme-text-faint text-center text-[11px] leading-tight">
            {!ready ? "Loading…" : "Rendering…"}
          </span>
        )}
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
