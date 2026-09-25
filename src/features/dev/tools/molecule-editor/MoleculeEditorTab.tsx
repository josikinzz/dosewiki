"use client";

/**
 * Molecule depiction editor (`/dev` → Molecules).
 *
 * Fix the wedge/hash stereo bonds and atom positions of a molecule's skeletal diagram
 * when the automatic layout draws them badly.
 *
 * This component owns only what outlives one open structure: the mode and
 * selection (mirrored into `/dev/molecule-editor/<mode>/<slug>`), the picker
 * data, the chemistry engines and the canvas settings. Everything about the
 * open structure lives in `MoleculeEditorSession`, keyed on `mode:selected`,
 * so switching selection starts a fresh session in one step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorRead } from "@/hooks/useEditorRead";
import { useConfirm } from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";
import { useOcl } from "./useOcl";
import { useRdkit } from "./useRdkit";
import { CLASS_STRUCTURES } from "./classStructures";
import { CLASS_TEMPLATE_OPTIONS } from "./classTemplateOptions";
import {
  buildSubstancePickerItems,
  type MoleculePickerItem,
} from "./moleculePickerOrdering";
import { useMoleculePickerRead } from "./useMoleculePickerRead";
import {
  isEditorMode,
  moleculeEditorSlug,
  parseMoleculeEditorSlug,
  type MoleculeEditorSelection,
} from "./moleculeEditorRoute";
import { MoleculeEditorSession } from "./MoleculeEditorSession";

const TEMPLATE_API = "/api/dev/molecule-class-template";

/** If server data has not arrived after this long, stop promising "Loading…". */
const LOAD_TIMEOUT_MS = 8000;

function psychoactiveClasses(classification: unknown): string[] {
  if (!classification || typeof classification !== "object" || !("psychoactive_class" in classification)) {
    return [];
  }
  return Array.isArray(classification.psychoactive_class)
    ? classification.psychoactive_class.filter((value): value is string => typeof value === "string")
    : [];
}

export function MoleculeEditorTab({ initialSlug }: { initialSlug?: string } = {}) {
  // `/dev/molecule-editor/<mode>/<slug>` lands with that structure open.
  const [selection, setSelection] = useState<MoleculeEditorSelection>(() =>
    parseMoleculeEditorSlug(initialSlug),
  );
  const { mode, selected } = selection;
  // A canvas preference, not part of any one structure, so it survives switching.
  const [fineRotation, setFineRotation] = useState(true);
  // OpenChemLib renders the preview + published SVG (same engine as the canvas);
  // RDKit remains for the InChI/canonical-SMILES guards and class layout. Idle
  // picker visits do not initialize either engine; selection activates both.
  const enginesEnabled = selected !== null;
  const { ocl, error: oclError } = useOcl(enginesEnabled);
  const { rdkit, error: rdkitError } = useRdkit(enginesEnabled);

  // Mirror the selection into the address so the open structure can be shared.
  const urlSlugRef = useRef(initialSlug);
  useEffect(() => {
    const slug = moleculeEditorSlug(selection);
    if (slug === urlSlugRef.current) return;
    urlSlugRef.current = slug;
    window.history.replaceState(null, "", viewToPath({ type: "dev", tab: "molecule-editor", slug }));
  }, [selection]);

  // The open session reports whether it holds unsaved work, so a switch can ask first.
  const sessionDirtyRef = useRef(false);
  const onSessionDirtyChange = useCallback((dirty: boolean) => {
    sessionDirtyRef.current = dirty;
  }, []);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const switchTo = useCallback(
    (next: MoleculeEditorSelection, description: string) => {
      const run = () => setSelection(next);
      if (!sessionDirtyRef.current) {
        run();
        return;
      }
      confirm({
        title: "Discard unsaved edits?",
        description,
        confirmLabel: "Discard and switch",
        destructive: true,
        onConfirm: run,
      });
    },
    [confirm],
  );
  const onSelect = useCallback(
    (slug: string) => {
      if (slug === selected) return;
      switchTo(
        { mode, selected: slug },
        mode === "substances"
          ? "Switching to another substance will discard the unsaved changes to this depiction."
          : "Switching to another class will discard the unsaved changes to this depiction.",
      );
    },
    [mode, selected, switchTo],
  );
  const onModeChange = useCallback(
    (nextMode: string) => {
      if (!isEditorMode(nextMode) || nextMode === mode) return;
      switchTo(
        { mode: nextMode, selected: null },
        "Switching editor modes will discard the unsaved changes to this depiction.",
      );
    },
    [mode, switchTo],
  );

  // Saved template keys, offered as import sources outside substances mode.
  const [templateKeys, setTemplateKeys] = useState<string[]>([]);
  useEffect(() => {
    if (mode === "substances") return;
    let cancelled = false;
    void fetch(`${TEMPLATE_API}?list=1`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          templates?: Array<{ classKey: string }>;
        };
        if (!cancelled && response.ok) {
          setTemplateKeys((body.templates ?? []).map((row) => row.classKey));
        }
      })
      .catch(() => {
        /* the picker simply omits templates when the list is unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // --- live picker data -----------------------------------------------------
  const pickerRows = useMoleculePickerRead(true);
  const overrideList = useEditorRead("moleculeOverrides:listSlugs", {}, "list");
  const overrideSet = useMemo(
    () => new Set([
      ...(overrideList ?? []).map((row) => row.slug),
      ...(pickerRows ?? []).filter((row) => row.hasOverride).map((row) => row.slug),
    ]),
    [overrideList, pickerRows],
  );
  const overrideCount = useMemo(
    () =>
      mode === "classes"
        ? Array.from(overrideSet).filter((slug) => slug.startsWith("class:")).length
        : Array.from(overrideSet).filter((slug) => !slug.startsWith("class:")).length,
    [mode, overrideSet],
  );
  const molecules = useMemo<MoleculePickerItem[] | null>(
    () => pickerRows
      ? buildSubstancePickerItems(
          pickerRows.map((row) => ({
            slug: row.slug,
            name: row.title,
            priority: typeof row.priority === "string" ? row.priority : undefined,
            indexCategories: Array.isArray(row.index_categories)
              ? row.index_categories.filter((value): value is string => typeof value === "string")
              : undefined,
            psychoactiveClasses: psychoactiveClasses(row.classification),
          })),
          overrideSet,
        )
      : null,
    [overrideSet, pickerRows],
  );
  const publishedCount = useMemo(
    () => (molecules ?? []).filter((item) => item.publiclyListed).length,
    [molecules],
  );
  const classStructures = useMemo<MoleculePickerItem[]>(
    () =>
      CLASS_STRUCTURES.map((item) => ({
        slug: item.key,
        title: item.label,
        hasOverride: overrideSet.has(`class:${item.key}`),
      })).sort((a, b) => a.title.localeCompare(b.title)),
    [overrideSet],
  );
  const classTemplates = useMemo<MoleculePickerItem[]>(
    () =>
      CLASS_TEMPLATE_OPTIONS.map((item) => ({
        slug: item.key,
        title: item.label,
        hasOverride: false,
      })),
    [],
  );
  // Import sources: any saved depiction other than the one being edited. Class
  // and template modes also offer the saved class overrides (their Postgres slugs
  // carry the class: prefix the depiction route expects).
  const importableMolecules = useMemo<MoleculePickerItem[] | null>(() => {
    if (!molecules) return null;
    const substanceSources = molecules.filter(
      (item) => item.hasOverride && !(mode === "substances" && item.slug === selected),
    );
    if (mode === "substances") return substanceSources;
    const classSources = classStructures
      .filter((item) => item.hasOverride && !(mode === "classes" && item.slug === selected))
      .map((item) => ({
        slug: `class:${item.slug}`,
        title: `${item.title} (class)`,
        hasOverride: true,
      }));
    const templateSources = classTemplates
      .filter(
        (item) =>
          templateKeys.includes(item.slug) &&
          !(mode === "templates" && item.slug === selected),
      )
      .map((item) => ({
        slug: `template:${item.slug}`,
        title: `${item.title} (template)`,
        hasOverride: true,
      }));
    return [...templateSources, ...classSources, ...substanceSources];
  }, [molecules, classStructures, classTemplates, templateKeys, mode, selected]);
  const pickerItems =
    mode === "classes" ? classStructures : mode === "templates" ? classTemplates : molecules;

  // If Postgres never resolves, stop showing an indefinite "Loading…".
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (pickerItems) {
      setLoadTimedOut(false);
      return;
    }
    const id = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [pickerItems]);

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <MoleculeEditorSession
        key={`${mode}:${selected ?? ""}`}
        mode={mode}
        selected={selected}
        onSelect={onSelect}
        onModeChange={onModeChange}
        onDirtyChange={onSessionDirtyChange}
        engines={{ ocl, oclError, rdkit, rdkitError }}
        fineRotation={fineRotation}
        onFineRotationChange={setFineRotation}
        picker={{
          items: pickerItems,
          loadTimedOut,
          loadedCount: pickerItems?.length ?? 0,
          overrideCount,
          publishedCount,
        }}
        molecules={molecules}
        classTemplates={classTemplates}
        importableMolecules={importableMolecules}
        overrideSet={overrideSet}
      />
      {confirmDialog}
    </div>
  );
}
