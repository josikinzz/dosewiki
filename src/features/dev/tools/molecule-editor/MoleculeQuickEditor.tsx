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
 * The host must provide a ConvexProvider and an authenticated editor session.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
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
import type { InchiComparison } from "./stereoGuard";
import { compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import { OclEditor } from "./OclEditor";
import { useRdkit } from "./useRdkit";

export type MoleculeQuickEditorProps = {
  /** Substance slug whose depiction is being edited. */
  slug: string;
  className?: string;
};

interface MoleculeOverride {
  slug: string;
  molblock: string;
  svg: string;
  smiles?: string;
  source?: "seeded" | "editor" | "template";
  updatedAt: string;
  updatedBy?: string;
}

/** The success / error outcome of the last Save. */
interface SaveResult {
  tone: "success" | "danger";
  message: string;
}

const SAVE_API = "/api/dev/molecule-override";

/** If the depiction data has not arrived after this long, stop promising "Loading…". */
const LOAD_TIMEOUT_MS = 8000;

/** Pull the article's SMILES from whichever shape the Convex doc carries. */
export function extractSubstanceSmiles(article: unknown): string {
  const a = article as { identification?: { smiles?: unknown } } | null | undefined;
  const smiles = a?.identification?.smiles;
  return typeof smiles === "string" ? smiles.trim() : "";
}

export function MoleculeQuickEditor({ slug, className }: MoleculeQuickEditorProps) {
  const { rdkit, error: rdkitError } = useRdkit();

  // "saved" shows the published Convex row; "auto" is an unsaved SMILES preview.
  const [variant, setVariant] = useState<"saved" | "auto">("saved");
  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [noStructure, setNoStructure] = useState(false);

  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [guard, setGuard] = useState<InchiComparison | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  const [overrideDoc, setOverrideDoc] = useState<MoleculeOverride | null | undefined>(undefined);
  const [overrideLoadError, setOverrideLoadError] = useState<string | null>(null);
  // Bumped after a successful save so the published row is re-read from the route.
  const [refreshToken, setRefreshToken] = useState(0);
  const loadedSlugRef = useRef<string | null>(null);

  const article = useQuery(api.substanceIndex.getBySlug, slug ? { slug } : "skip");
  const smiles = useMemo(() => extractSubstanceSmiles(article), [article]);

  // Reset per-slug editing state when the host rebinds the component.
  useEffect(() => {
    setVariant("saved");
    setSaveResult(null);
    setCanvasError(null);
    setConfirmRevert(false);
    setOverrideLoadError(null);
  }, [slug]);

  // Read the editable record through the protected editor route (same Convex target
  // as the save), refetching quietly after a save without flashing the loading state.
  useEffect(() => {
    if (!slug) {
      setOverrideDoc(undefined);
      setOverrideLoadError(null);
      return;
    }
    const slugChanged = loadedSlugRef.current !== slug;
    loadedSlugRef.current = slug;
    let cancelled = false;
    if (slugChanged) setOverrideDoc(undefined);
    setOverrideLoadError(null);
    void fetch(`${SAVE_API}?slug=${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          override?: MoleculeOverride | null;
        };
        if (!response.ok) {
          throw new Error(body.error ?? `Molecule load failed (${response.status})`);
        }
        if (!cancelled) setOverrideDoc(body.override ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOverrideDoc(null);
        setOverrideLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  // --- resolve the canvas source (published row, or a local SMILES auto layout) ---
  useEffect(() => {
    if (!slug) {
      setSource(null);
      setEdited(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (overrideDoc === undefined) {
      setComputing(true);
      return; // published row still loading
    }
    if (variant === "saved" && overrideDoc) {
      setSource(overrideDoc.molblock);
      setEdited(overrideDoc.molblock);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (article === undefined) {
      setComputing(true);
      return; // article still loading
    }
    if (!smiles) {
      setSource(null);
      setEdited(null);
      setNoStructure(true);
      setComputing(false);
      return;
    }
    let cancelled = false;
    setComputing(true);
    void smilesToMolblock(smiles).then((molblock) => {
      if (cancelled) return;
      if (molblock) {
        setSource(molblock);
        setEdited(molblock);
        setNoStructure(false);
      } else {
        setSource(null);
        setEdited(null);
        setNoStructure(true);
      }
      setComputing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, variant, overrideDoc, article, smiles]);

  // --- recompute preview + stereo guard on every edit (debounced) ---------------
  useEffect(() => {
    if (!rdkit || !edited) {
      setPreviewSvg(null);
      setGuard(null);
      return;
    }
    const id = setTimeout(() => {
      setPreviewSvg(renderMoleculeSvg(rdkit, edited));
      setGuard(smiles ? compareInchi(rdkit, smiles, edited) : null);
    }, 120);
    return () => clearTimeout(id);
  }, [rdkit, edited, smiles]);

  // If the depiction data never resolves, stop showing an indefinite "Loading…".
  const dataPending =
    overrideDoc === undefined || article === undefined || (!rdkit && !rdkitError);
  useEffect(() => {
    if (!dataPending) {
      setLoadTimedOut(false);
      return;
    }
    const id = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [dataPending]);

  // Auto-clear a success notice; errors stay until dismissed or superseded.
  useEffect(() => {
    if (saveResult?.tone !== "success") return;
    const id = setTimeout(() => setSaveResult(null), 6000);
    return () => clearTimeout(id);
  }, [saveResult]);

  const guardMismatch = guard != null && !guard.match;
  // `edited` only diverges from `source` on a real user edit (OclEditor filters
  // programmatic loads), so this is a reliable dirty flag.
  const dirty = edited !== source;
  const renderBlocked = !!rdkitError || !!canvasError;
  const canSave = dirty && !!edited && !!previewSvg && !saving && !noStructure && !renderBlocked;
  const loadedFromOverride = variant === "saved" && !!overrideDoc;

  const save = useCallback(async () => {
    if (!slug || !edited || !rdkit) return;
    setSaving(true);
    setSaveResult(null);
    // Render the published SVG from `edited` right now — the debounced preview can
    // lag the newest edit, and the posted SVG is what the public article serves.
    const svg = renderMoleculeSvg(rdkit, edited);
    if (!svg) {
      setSaving(false);
      setSaveResult({
        tone: "danger",
        message: "The edited structure couldn't be rendered, so nothing was saved.",
      });
      return;
    }
    setPreviewSvg(svg);
    try {
      const res = await fetch(SAVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, molblock: edited, svg, smiles }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setOverrideDoc({
        slug,
        molblock: edited,
        svg,
        ...(smiles ? { smiles } : {}),
        source: "editor",
        updatedAt: new Date().toISOString(),
      });
      setVariant("saved");
      setSaveResult({
        tone: "success",
        message:
          "Saved — this is now the published depiction. The substance page refreshes momentarily.",
      });
      // Re-read the published row so the editor's idea of "saved" comes from Convex.
      setRefreshToken((token) => token + 1);
    } catch (err) {
      setSaveResult({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [slug, edited, rdkit, smiles]);

  // Canvas-only: regenerates the SMILES auto layout. Nothing is published until Save.
  const applyRevert = useCallback(() => {
    setVariant("auto");
    setSaveResult(null);
    setConfirmRevert(false);
  }, []);

  const revertToAuto = useCallback(() => {
    if (dirty) {
      setConfirmRevert(true);
      return;
    }
    applyRevert();
  }, [dirty, applyRevert]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* ---- header row: provenance + renderer status ------------------------ */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="theme-text-faint text-xs">
          <span className="theme-text-muted font-mono">{slug}</span>
          {!noStructure ? (
            <>
              {" · "}
              <span>{loadedFromOverride ? "published depiction" : "unsaved auto layout"}</span>
            </>
          ) : null}
        </span>
        <span className="ml-auto">
          {rdkitError ? (
            <EditorStatusPill tone="danger" icon="lucide:circle-alert">
              renderer failed
            </EditorStatusPill>
          ) : rdkit ? (
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
      {rdkitError ? (
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
          <PreviewBox svg={previewSvg} ready={!!rdkit} error={!!rdkitError} />
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
                  <Button variant="outline" size="sm" onClick={() => setSaveResult(null)}>
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
          if (!open) setConfirmRevert(false);
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
            <Button variant="outline" onClick={() => setConfirmRevert(false)}>
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
            // RDKit.js output rendered from our own MOL block (editor preview).
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
