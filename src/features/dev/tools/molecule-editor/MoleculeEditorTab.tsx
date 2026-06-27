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
 * Data is live Convex, so this works on the deployed admin host (not just locally):
 *   • the picker + per-substance SMILES come from the `substanceIndex` queries
 *   • the starting structure is generated in-browser from SMILES (`smilesToMolblock`),
 *     since base `.mol` files are not deployed
 *   • a saved override is read from `moleculeOverrides`, and Save / Remove POST to the
 *     editor-gated `/api/dev/molecule-override` route, which writes Convex + revalidates
 *     the public substance page.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorListItem,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorStatusPill,
} from "@/features/dev/components";
import type { InchiComparison } from "./stereoGuard";
import { compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import { OclEditor } from "./OclEditor";
import { useRdkit } from "./useRdkit";

interface MoleculeListItem {
  slug: string;
  title: string;
  hasOverride: boolean;
}

const SAVE_API = "/api/dev/molecule-override";

/** Pull the article's SMILES from whichever shape the Convex doc carries. */
function extractSmiles(article: unknown): string {
  const a = article as { identification?: { smiles?: unknown } } | null | undefined;
  const smiles = a?.identification?.smiles;
  return typeof smiles === "string" ? smiles.trim() : "";
}

export function MoleculeEditorTab() {
  const { rdkit, error: rdkitError } = useRdkit();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // "saved" shows a stored override when present; "auto" forces the SMILES base layout.
  const [variant, setVariant] = useState<"saved" | "auto">("saved");

  // `source` is the MOL block fed INTO the editor (changes on select / revert only);
  // `edited` is the live MOL block coming OUT of the editor (drives preview + guard + save).
  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [noStructure, setNoStructure] = useState(false);

  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [guard, setGuard] = useState<InchiComparison | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // --- live Convex data -----------------------------------------------------
  const lookup = useQuery(api.substanceIndex.getLookup);
  const overrideList = useQuery(api.moleculeOverrides.listSlugs);
  const overrideDoc = useQuery(
    api.moleculeOverrides.getBySlug,
    selected ? { slug: selected } : "skip",
  );
  const article = useQuery(
    api.substanceIndex.getBySlug,
    selected ? { slug: selected } : "skip",
  );

  const overrideSet = useMemo(
    () => new Set((overrideList ?? []).map((row) => row.slug)),
    [overrideList],
  );
  const molecules = useMemo<MoleculeListItem[] | null>(() => {
    if (!lookup) return null;
    return lookup
      .map((item) => ({
        slug: item.slug,
        title: item.name,
        hasOverride: overrideSet.has(item.slug),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [lookup, overrideSet]);

  const smiles = useMemo(() => extractSmiles(article), [article]);
  const hasOverride = !!overrideDoc;
  const loadedFromOverride = variant === "saved" && hasOverride;

  // --- resolve the editor's source MOL block (saved override or SMILES base) -
  useEffect(() => {
    if (!selected) {
      setSource(null);
      setEdited(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (overrideDoc === undefined) {
      setComputing(true);
      return; // override still loading
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
  }, [selected, variant, overrideDoc, article, smiles]);

  const onSelect = useCallback((slug: string) => {
    setSelected(slug);
    setVariant("saved");
    setSaveMsg(null);
  }, []);

  // --- recompute preview + stereo guard on every edit (debounced) -----------
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

  const filtered = useMemo(() => {
    if (!molecules) return [];
    const q = search.trim().toLowerCase();
    if (!q) return molecules;
    return molecules.filter(
      (m) => m.title.toLowerCase().includes(q) || m.slug.includes(q),
    );
  }, [molecules, search]);

  const overrideCount = overrideSet.size;
  const guardMismatch = guard != null && !guard.match;
  const canSave = !!edited && !!previewSvg && !saving && !noStructure;

  // --- save / revert / remove ----------------------------------------------
  const save = useCallback(async () => {
    if (!selected || !edited || !previewSvg) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(SAVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selected, molblock: edited, svg: previewSvg, smiles }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setVariant("saved");
      setSaveMsg("Saved — the override is live. The substance page refreshes momentarily.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [selected, edited, previewSvg, smiles]);

  const revertToAuto = useCallback(() => {
    setVariant("auto");
    setSaveMsg(null);
  }, []);

  const removeOverride = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${SAVE_API}?slug=${selected}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Remove failed (${res.status})`);
      setVariant("auto");
      setSaveMsg("Override removed — reverted to the automatic layout.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [selected]);

  // ---------------------------------------------------------------------------
  return (
    <div className="mt-10 space-y-6">
      <EditorPanel>
        <EditorPanelHeader
          icon="lucide:hexagon"
          title="Molecule depiction editor"
          description="Drag atoms and reassign wedge / hash stereo bonds to fix a molecule's skeletal diagram. Saving writes a live override the public article picks up within moments."
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
                  ? `${filtered.length} of ${molecules.length} substances · ${overrideCount} overridden`
                  : "Loading substances…"}
              </p>
              <div className="max-h-[32rem] space-y-1 overflow-y-auto rounded-xl border border-dose-border bg-dose-surface-muted p-1.5">
                {!molecules ? (
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
              ) : noStructure ? (
                <NoStructureCanvas />
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
                    {computing ? (
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

              <GuardRow guard={guard} hasReference={!!smiles} active={!!selected && !noStructure} />

              {selected && !noStructure ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="theme-text-faint">Slug</dt>
                  <dd className="theme-text-muted truncate font-mono">{selected}</dd>
                  <dt className="theme-text-faint">Loaded</dt>
                  <dd className="theme-text-muted">
                    {loadedFromOverride ? "saved override" : "auto layout"}
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
                    disabled={!selected || noStructure || saving}
                    className="flex-1"
                  >
                    <Icon icon="lucide:rotate-ccw" size={15} />
                    Revert to auto
                  </Button>
                  <Button
                    variant="ghostDestructive"
                    onClick={removeOverride}
                    disabled={!hasOverride || saving}
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
            // RDKit.js output rendered from our own MOL block (editor preview).
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

function NoStructureCanvas() {
  return (
    <div className="grid min-h-[34rem] place-items-center rounded-xl border border-dashed border-dose-border bg-dose-surface-muted">
      <div className="max-w-xs text-center">
        <div className="theme-text-faint mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-dose-body">
          <Icon icon="lucide:flask-conical-off" size={22} />
        </div>
        <p className="theme-text-primary font-medium">No structure to edit</p>
        <p className="theme-text-faint mt-1 text-sm">
          This substance has no SMILES, so there's no skeletal diagram to fix. Add a SMILES string in
          the substance editor first.
        </p>
      </div>
    </div>
  );
}
