"use client";

/**
 * Molecule depiction editor (`/dev` → Molecules).
 *
 * Fix the wedge/hash stereo bonds and atom positions of a molecule's skeletal diagram
 * when the automatic RDKit layout draws them badly. Three zones:
 *   • left   — filterable substance picker (badge marks molecules that already have an override)
 *   • centre — OpenChemLib canvas: drag atoms, set per-bond wedge/hash stereo
 *   • right  — live brand-styled RDKit.js preview + stereo guard + Save / Revert
 *
 * Pure data/render logic lives in sibling modules (renderMoleculeSvg, stereoGuard) and the
 * dev-only API route /api/dev/molecule-layout. This component is the UX layer wiring them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorListItem,
  EditorNotice,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorStatusPill,
} from "@/features/dev/components";
import type { InchiComparison } from "./stereoGuard";
import { compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { OclEditor } from "./OclEditor";
import { useRdkit } from "./useRdkit";

interface MoleculeListItem {
  slug: string;
  title: string;
  hasOverride: boolean;
}
interface MoleculeDetail {
  slug: string;
  smiles: string;
  molblock: string;
  source: "override" | "base";
  hasOverride: boolean;
}

const API = "/api/dev/molecule-layout";

export function MoleculeEditorTab() {
  const { rdkit, error: rdkitError } = useRdkit();

  const [molecules, setMolecules] = useState<MoleculeListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<MoleculeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // `source` is the MOL block fed INTO the editor (changes on select / revert only);
  // `edited` is the live MOL block coming OUT of the editor (drives preview + guard + save).
  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);

  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [guard, setGuard] = useState<InchiComparison | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // --- load the picker list -------------------------------------------------
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(API);
        if (res.status === 403) {
          if (alive) setBlocked(true);
          return;
        }
        if (!res.ok) throw new Error(`List failed (${res.status})`);
        const data = (await res.json()) as { molecules: MoleculeListItem[] };
        if (alive) setMolecules(data.molecules);
      } catch (err) {
        if (alive) setListError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // --- load a molecule's molblock when selected -----------------------------
  const loadMolecule = useCallback(
    async (slug: string, variant?: "base") => {
      setDetailLoading(true);
      setSaveMsg(null);
      try {
        const url = variant ? `${API}?slug=${slug}&variant=${variant}` : `${API}?slug=${slug}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Load failed (${res.status})`);
        }
        const data = (await res.json()) as MoleculeDetail;
        setDetail(data);
        setSource(data.molblock);
        setEdited(data.molblock);
      } catch (err) {
        setSaveMsg(err instanceof Error ? err.message : String(err));
        setDetail(null);
        setSource(null);
        setEdited(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const onSelect = useCallback(
    (slug: string) => {
      setSelected(slug);
      void loadMolecule(slug);
    },
    [loadMolecule],
  );

  // --- recompute preview + stereo guard on every edit (debounced) -----------
  useEffect(() => {
    if (!rdkit || !edited) {
      setPreviewSvg(null);
      setGuard(null);
      return;
    }
    const id = setTimeout(() => {
      setPreviewSvg(renderMoleculeSvg(rdkit, edited));
      setGuard(detail?.smiles ? compareInchi(rdkit, detail.smiles, edited) : null);
    }, 120);
    return () => clearTimeout(id);
  }, [rdkit, edited, detail?.smiles]);

  const filtered = useMemo(() => {
    if (!molecules) return [];
    const q = search.trim().toLowerCase();
    if (!q) return molecules;
    return molecules.filter(
      (m) => m.title.toLowerCase().includes(q) || m.slug.includes(q),
    );
  }, [molecules, search]);

  const overrideCount = useMemo(
    () => molecules?.filter((m) => m.hasOverride).length ?? 0,
    [molecules],
  );

  const guardMismatch = guard != null && !guard.match;
  const canSave = !!edited && !!previewSvg && !saving;

  // --- save / revert / remove ----------------------------------------------
  const markOverride = useCallback((slug: string, hasOverride: boolean) => {
    setMolecules((prev) =>
      prev
        ? prev.map((m) => (m.slug === slug ? { ...m, hasOverride } : m))
        : prev,
    );
  }, []);

  const save = useCallback(async () => {
    if (!detail || !edited || !previewSvg) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: detail.slug, molblock: edited, svg: previewSvg }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        renderedBy?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      markOverride(detail.slug, true);
      setDetail({ ...detail, hasOverride: true, source: "override" });
      setSaveMsg(
        body.renderedBy === "python"
          ? "Saved · public SVG re-rendered by the brand pipeline."
          : "Saved · public SVG written from the in-browser preview.",
      );
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [detail, edited, previewSvg, markOverride]);

  const revertToAuto = useCallback(() => {
    if (selected) void loadMolecule(selected, "base");
  }, [selected, loadMolecule]);

  const removeOverride = useCallback(async () => {
    if (!detail) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${API}?slug=${detail.slug}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Remove failed (${res.status})`);
      }
      markOverride(detail.slug, false);
      setSaveMsg("Override removed · molecule reverted to automatic layout.");
      await loadMolecule(detail.slug, "base");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [detail, markOverride, loadMolecule]);

  // ---------------------------------------------------------------------------
  if (blocked) {
    return (
      <div className="mt-10">
        <EditorPanel>
          <EditorPanelBody>
            <EditorNotice
              notice={{
                tone: "warning",
                title: "Local-only tool",
                message:
                  "The molecule depiction editor writes files in the working tree, so it only runs against a local dev server (npm run dev), not a deployed build.",
              }}
            />
          </EditorPanelBody>
        </EditorPanel>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-6">
      <EditorPanel>
        <EditorPanelHeader
          icon="lucide:hexagon"
          title="Molecule depiction editor"
          description="Drag atoms and reassign wedge / hash stereo bonds to fix a molecule's skeletal diagram. Edits save as a per-molecule override the render pipeline draws verbatim."
          actions={<RdkitStatus rdkit={!!rdkit} error={rdkitError} />}
        />
        <EditorPanelBody>
          <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
            {/* ---- 1. picker --------------------------------------------- */}
            <section className="flex min-h-0 flex-col gap-3">
              <div className="relative">
                <Icon
                  icon="lucide:search"
                  size={16}
                  className="theme-text-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or slug…"
                  className="pl-10"
                  aria-label="Search molecules"
                />
              </div>
              <p className="theme-text-faint text-xs">
                {molecules
                  ? `${filtered.length} of ${molecules.length} molecules · ${overrideCount} overridden`
                  : "Loading molecules…"}
              </p>
              <div className="max-h-[32rem] space-y-1 overflow-y-auto rounded-xl border border-dose-border bg-dose-surface-muted p-1.5">
                {listError ? (
                  <p className="theme-text-faint px-3 py-8 text-center text-sm">{listError}</p>
                ) : !molecules ? (
                  <p className="theme-text-faint px-3 py-8 text-center text-sm">Loading…</p>
                ) : filtered.length === 0 ? (
                  <p className="theme-text-faint px-3 py-8 text-center text-sm">No molecules found</p>
                ) : (
                  filtered.map((m) => (
                    <EditorListItem
                      key={m.slug}
                      active={selected === m.slug}
                      onSelect={() => onSelect(m.slug)}
                      badge={
                        m.hasOverride ? (
                          <EditorStatusPill tone="info" icon="lucide:pencil">
                            edited
                          </EditorStatusPill>
                        ) : undefined
                      }
                    >
                      <span className="theme-text-primary truncate font-medium">{m.title}</span>
                      <span className="theme-text-faint ml-2 shrink-0 text-xs">{m.slug}</span>
                    </EditorListItem>
                  ))
                )}
              </div>
            </section>

            {/* ---- 2. editor --------------------------------------------- */}
            <section className="flex min-h-[34rem] flex-col gap-2">
              {!selected ? (
                <EmptyCanvas />
              ) : (
                <>
                  <div className="theme-text-faint flex items-center gap-2 text-xs">
                    <Icon icon="lucide:move" size={13} />
                    <span>
                      Drag atoms to reposition · use the wedge / hash bond tools to fix stereo. The
                      preview and guard update live.
                    </span>
                  </div>
                  <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-dose-border bg-dose-body">
                    <OclEditor source={source} onChange={setEdited} className="h-full w-full" />
                    {detailLoading ? (
                      <div className="theme-text-faint absolute inset-0 grid place-items-center bg-dose-surface-muted/70 text-sm">
                        <span className="inline-flex items-center gap-2">
                          <Icon icon="lucide:loader-2" size={15} className="animate-spin" />
                          Loading molecule…
                        </span>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>

            {/* ---- 3. preview + guard + actions -------------------------- */}
            <aside className="flex flex-col gap-4">
              <PreviewBox svg={previewSvg} ready={!!rdkit} hasSelection={!!selected} />

              <GuardRow guard={guard} hasReference={!!detail?.smiles} active={!!selected} />

              {detail ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="theme-text-faint">Slug</dt>
                  <dd className="theme-text-muted truncate font-mono">{detail.slug}</dd>
                  <dt className="theme-text-faint">Loaded</dt>
                  <dd className="theme-text-muted">
                    {detail.source === "override" ? "saved override" : "auto layout"}
                  </dd>
                </dl>
              ) : null}

              <div className="mt-auto flex flex-col gap-2">
                <Button
                  variant={guardMismatch ? "destructive" : "accent"}
                  onClick={save}
                  disabled={!canSave}
                  className="w-full"
                >
                  <Icon
                    icon={saving ? "lucide:loader-2" : "lucide:save"}
                    size={16}
                    className={saving ? "animate-spin" : undefined}
                  />
                  {guardMismatch ? "Save anyway — chemistry changed" : "Save override"}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={revertToAuto}
                    disabled={!selected || saving}
                    className="flex-1"
                  >
                    <Icon icon="lucide:rotate-ccw" size={15} />
                    Revert to auto
                  </Button>
                  <Button
                    variant="ghostDestructive"
                    onClick={removeOverride}
                    disabled={!detail?.hasOverride || saving}
                    className="flex-1"
                    title="Delete the saved override and return this molecule to automatic layout"
                  >
                    <Icon icon="lucide:trash-2" size={15} />
                    Remove
                  </Button>
                </div>
                {saveMsg ? (
                  <p className="theme-text-muted text-xs" role="status">
                    {saveMsg}
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        </EditorPanelBody>
      </EditorPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
function RdkitStatus({ rdkit, error }: { rdkit: boolean; error: string | null }) {
  if (error) {
    return (
      <EditorStatusPill tone="danger" icon="lucide:circle-alert">
        renderer failed
      </EditorStatusPill>
    );
  }
  return rdkit ? (
    <EditorStatusPill tone="success" icon="lucide:check">
      renderer ready
    </EditorStatusPill>
  ) : (
    <EditorStatusPill tone="neutral" loading live>
      loading renderer
    </EditorStatusPill>
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
        chemistry changed — InChI differs
      </EditorStatusPill>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
        Stereo guard
      </span>
      <div>{pill}</div>
    </div>
  );
}

function PreviewBox({
  svg,
  ready,
  hasSelection,
}: {
  svg: string | null;
  ready: boolean;
  hasSelection: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
        Brand preview
      </span>
      <div className="grid aspect-square w-full place-items-center rounded-xl border border-dose-border bg-dose-surface-muted p-5">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain"
            // RDKit.js output rendered from our own MOL block (local dev tool).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <span className="theme-text-faint text-center text-sm">
            {!hasSelection
              ? "Pick a molecule to preview"
              : !ready
                ? "Loading renderer…"
                : "Rendering…"}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="grid min-h-[34rem] place-items-center rounded-xl border border-dashed border-dose-border bg-dose-surface-muted">
      <div className="max-w-xs text-center">
        <div className="theme-text-faint mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-dose-body">
          <Icon icon="lucide:hexagon" size={22} />
        </div>
        <p className="theme-text-primary font-medium">Select a molecule</p>
        <p className="theme-text-faint mt-1 text-sm">
          Choose a substance on the left to load its structure, then drag atoms and fix wedge / hash
          stereo bonds.
        </p>
      </div>
    </div>
  );
}
