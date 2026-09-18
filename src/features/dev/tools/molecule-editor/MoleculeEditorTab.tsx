"use client";

/**
 * Molecule depiction editor (`/dev` → Molecules).
 *
 * Fix the wedge/hash stereo bonds and atom positions of a molecule's skeletal diagram
 * when the automatic layout draws them badly.
 *   • picker — searchable substance combobox, publicly listed articles first and
 *     grouped by category (a "saved" pill marks molecules that already have a
 *     Postgres depiction; "published" marks a publicly listed article)
 *   • canvas: OpenChemLib editor behind a labeled dose.wiki tool strip: reposition
 *     atoms (Select), set per-bond wedge/hash stereo; an "Adjust" row above it holds
 *     the whole-depiction transforms
 *   • preview and settings: live brand-styled preview rendered by the same OpenChemLib
 *     engine as the canvas, plus fine rotation and tracing; a side column at xl widths,
 *     a collapsed disclosure below that
 *   • save bar: RDKit-backed stereo guard + Revert / Save in one slim row that stays
 *     in reach while the canvas scrolls
 *
 * Data is live Postgres, so this works on the deployed admin host (not just locally):
 *   • the picker + per-substance SMILES come from the `substanceIndex` queries
 *   • the starting structure is the published `moleculeOverrides` MOL block (including
 *     seeded auto-layout baselines); Revert to auto regenerates a local SMILES layout
 *   • Save POSTs to the editor-gated `/api/dev/molecule-override` route, which writes
 *     Postgres + revalidates the public substance page
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorRead, useInvalidateEditorReads } from "@/hooks/useEditorRead";
import { ConfirmDialog, type ConfirmRequest } from "@/features/dev/components";
import type { InchiComparison } from "./stereoGuard";
import { compareCanonicalSmiles, compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import type {
  MoleculeMirrorDirection,
  MoleculeSnapKind,
  MoleculeSnapOutcome,
} from "./moleculeTransforms";
import { useOcl } from "./useOcl";
import { useRdkit } from "./useRdkit";
import {
  classAtomLabels,
  convertTypedRGroups,
  normalizeClassMolblock,
  parseClassDummies,
  stripOclCustomLabelSgroups,
} from "./applyRLabelsToMolblock";
import { CLASS_STRUCTURES, type ClassStructureItem } from "./classStructures";
import {
  buildClassTemplateMemberOptions,
  CLASS_TEMPLATE_OPTIONS,
} from "./classTemplateOptions";
import {
  buildSubstancePickerItems,
  type MoleculePickerItem,
} from "./moleculePickerOrdering";
import { stripDummyAtoms } from "./stripDummyAtoms";
import { TemplateApplyDialog } from "./TemplateApplyDialog";
import { useTracingLayer } from "./TracingLayer";
import { useTemplateApplication } from "./useTemplateApplication";
import { useMoleculeSourceRead } from "./useMoleculeSourceRead";
import { useMoleculePickerRead } from "./useMoleculePickerRead";
import { MoleculeEditorModePanel } from "./MoleculeEditorModePanel";
import { MoleculeEditorWorkbench } from "./MoleculeEditorWorkbench";
import type {
  EditorMode,
  MoleculeClassTemplate,
  MoleculeOverride,
  SaveResult,
} from "./moleculeEditorTypes";


const SAVE_API = "/api/dev/molecule-override";
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
  const [mode, setMode] = useState<EditorMode>("substances");
  // Deep links (`/dev/molecules/{slug}`) land with the substance preselected.
  const [selected, setSelected] = useState<string | null>(initialSlug ?? null);
  // OpenChemLib renders the preview + published SVG (same engine as the canvas);
  // RDKit remains for the InChI/canonical-SMILES guards and class layout. Idle
  // picker visits do not initialize either engine; selection activates both.
  const enginesEnabled = selected !== null;
  const { ocl, error: oclError } = useOcl(enginesEnabled);
  const { rdkit, error: rdkitError } = useRdkit(enginesEnabled);
  // "saved" shows the published Postgres row; "auto" is an unsaved SMILES preview;
  // "imported" is another substance's depiction loaded as an analogue starting point.
  const [variant, setVariant] = useState<"saved" | "auto" | "imported">("saved");
  // The imported MOL block backing the "imported" variant (canvas-only until Save).
  const [importedMolblock, setImportedMolblock] = useState<string | null>(null);
  const [importSlug, setImportSlug] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pasteSmilesInput, setPasteSmilesInput] = useState("");

  // `source` is the MOL block fed INTO the editor (changes on select / revert only);
  // `edited` is the live MOL block coming OUT of the editor (drives preview + guard + save).
  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  // Labels reported by the canvas alongside the latest emission — the display
  // truth of what OCL currently draws, keyed by that emission's atom indices.
  // null until the first edit after a baseline load (the canvas then shows the
  // load-time `classLabels` map, so the preview falls back to it).
  const [emissionLabels, setEmissionLabels] = useState<Record<number, string> | null>(null);
  // Bumped on every baseline load. The canvas is uncontrolled once loaded, so an
  // equal `source` string — which React's setState skips — would not reload it;
  // the epoch is what makes "reset `edited`" and "reload the canvas" one step.
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [fineRotation, setFineRotation] = useState(true);
  const [mirrorDirection, setMirrorDirection] = useState<MoleculeMirrorDirection | null>(null);
  const [snapRequest, setSnapRequest] = useState<MoleculeSnapKind | null>(null);
  // Lasso-selected bond count reported live by the canvas; a single selected bond
  // lets "Set bond vertical" apply immediately instead of entering pick mode.
  const [selectedBondCount, setSelectedBondCount] = useState(0);
  // Click-to-pick mode: the canvas shows a pick overlay and the next clicked bond
  // is rotated to vertical.
  const [bondPickActive, setBondPickActive] = useState(false);
  // Bold-bond depiction state: the canvas's current bold set, the saved baseline
  // it is compared against for dirtiness, and the click-to-toggle arming flag.
  const [boldBonds, setBoldBonds] = useState<number[]>([]);
  const [boldBaseline, setBoldBaseline] = useState<number[]>([]);
  const [boldToggleActive, setBoldToggleActive] = useState(false);
  const [computing, setComputing] = useState(false);
  const [noStructure, setNoStructure] = useState(false);

  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [guard, setGuard] = useState<InchiComparison | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  // Set when the OpenChemLib canvas fails to construct; blocks Save like rdkitError.
  const [canvasError, setCanvasError] = useState<string | null>(null);
  // Pending destructive / discard confirmation rendered through the kit Dialog.
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  // Flipped on once Postgres data has stayed unavailable past LOAD_TIMEOUT_MS.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [templateDoc, setTemplateDoc] = useState<MoleculeClassTemplate | null | undefined>(
    undefined,
  );
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);
  const [templateSmilesInput, setTemplateSmilesInput] = useState("");
  const [templateMemberSlug, setTemplateMemberSlug] = useState<string | null>(null);
  const [initializingTemplate, setInitializingTemplate] = useState(false);
  const [overrideDoc, setOverrideDoc] = useState<MoleculeOverride | null | undefined>(undefined);
  const [overrideLoadError, setOverrideLoadError] = useState<string | null>(null);
  // See-through reference image over the canvas; session-only, never saved.
  const tracing = useTracingLayer();
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

  // --- live server data -----------------------------------------------------
  const pickerRows = useMoleculePickerRead(true);
  const overrideList = useEditorRead("moleculeOverrides:listSlugs", {}, "list");
  const invalidateEditorReads = useInvalidateEditorReads();
  const moleculeSource = useMoleculeSourceRead(
    selected && mode === "substances" ? selected : null,
  );
  // Only the loading/loaded transition may re-resolve the baseline. A polled
  // source read can redeliver equal data without replacing a dirty canvas.
  const articleLoading = moleculeSource === undefined;
  const sourceRef = useRef<string | null>(null);

  /**
   * Re-express a molblock in the exact textual form the canvas emits: the same
   * OCL parse → `toMolfile` round-trip `OclEditor` performs, followed by the
   * same custom-label S-group strip and dummy-atom chemistry restoration
   * `OclEditor`/`handleEditorChange` apply (both no-ops for substance
   * molblocks, which have no labels or dummies). Baselines installed in this
   * form compare string-equal to a zero-edit canvas emission, so
   * `edited !== source` — the unsaved-changes flag — only trips on a real edit,
   * never on RDKit/Postgres vs OCL formatting differences.
   */
  const normalizeForComparison = useCallback(
    (molblock: string): string => {
      if (!ocl) return molblock;
      try {
        const roundTripped = stripOclCustomLabelSgroups(
          ocl.Molecule.fromMolfile(molblock).toMolfile(),
        );
        return normalizeClassMolblock(roundTripped, molblock, parseClassDummies(molblock));
      } catch {
        return molblock; // unparseable: keep raw; the canvas load surfaces the error
      }
    },
    [ocl],
  );

  /**
   * Install a MOL block as the editor's baseline, resetting the live edit with it.
   *
   * `edited` must never be reset without reloading the canvas. The canvas is
   * uncontrolled after load, so resetting one and not the other leaves the user
   * looking at a drawing that no longer exists in the state Save publishes —
   * which is exactly how rotations reached the canvas but not the article.
   * `force` is for explicit user actions ("load this structure"), which must
   * reset even when the baseline is unchanged.
   */
  const loadSource = useCallback(
    (molblock: string | null, options?: { force?: boolean; boldBonds?: number[] }) => {
      const normalized = molblock === null ? null : normalizeForComparison(molblock);
      if (!options?.force && sourceRef.current === normalized) return;
      sourceRef.current = normalized;
      setSource(normalized);
      setEdited(normalized);
      setEmissionLabels(null);
      // Bold bonds belong to the baseline: a new baseline installs its own set,
      // and the redelivery no-op above keeps unsaved toggles from being reset.
      const bold = options?.boldBonds ?? [];
      setBoldBonds(bold);
      setBoldBaseline(bold);
      setSourceEpoch((epoch) => epoch + 1);
    },
    [normalizeForComparison],
  );

  /** Accept the live edit as the new baseline after a successful save. */
  const markSourceSaved = useCallback((molblock: string) => {
    sourceRef.current = molblock;
    setSource(molblock);
  }, []);

  const templateMemberOverride = useEditorRead(
    "moleculeOverrides:getBySlug",
    mode === "templates" && templateMemberSlug ? { slug: templateMemberSlug } : "skip",
    "document",
  );
  const classMembershipInput = useMoleculePickerRead(
    mode === "templates" && !!selected,
    selected,
  );
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
  const selectedTemplateLabel =
    classTemplates.find((item) => item.slug === selected)?.title ?? selected ?? "class";
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

  const selectedClass = useMemo<ClassStructureItem | null>(
    () => CLASS_STRUCTURES.find((item) => item.key === selected) ?? null,
    [selected],
  );
  const smiles = mode === "classes" ? selectedClass?.smiles ?? "" : moleculeSource?.smiles ?? "";
  const pickerItems =
    mode === "classes" ? classStructures : mode === "templates" ? classTemplates : molecules;
  const loadedCount = pickerItems?.length ?? 0;
  const hasOverride = mode === "templates" ? !!templateDoc : !!overrideDoc;
  const loadedFromOverride =
    mode === "templates" ? !!templateDoc : variant === "saved" && hasOverride;
  const templateMemberItems = useMemo<MoleculePickerItem[]>(
    () =>
      mode === "templates" && selected
        ? buildClassTemplateMemberOptions(selected, classMembershipInput ?? [], overrideSet).map(
            (member) => ({ ...member, hasOverride: true }),
          )
        : [],
    [classMembershipInput, mode, overrideSet, selected],
  );
  const templateApplyMemberItems = useMemo<MoleculePickerItem[]>(
    () =>
      mode === "templates" && selected
        ? buildClassTemplateMemberOptions(selected, classMembershipInput ?? []).map((member) => ({
            ...member,
            hasOverride: overrideSet.has(member.slug),
          }))
        : [],
    [classMembershipInput, mode, overrideSet, selected],
  );
  const templateApplication = useTemplateApplication({
    enabled: mode === "templates",
    classKey: selected,
    templateMolblock: templateDoc?.molblock,
    members: templateApplyMemberItems,
    rdkit,
    ocl,
  });
  const templateMemberReady = !!templateMemberSlug && !!templateMemberOverride;
  // readBoldBonds emits ascending indices and baselines are stored the same way,
  // so positional comparison is an order-insensitive set comparison.
  const boldDirty =
    boldBonds.length !== boldBaseline.length ||
    boldBonds.some((bond, index) => bond !== boldBaseline[index]);
  const hasUnsavedChanges =
    edited !== source || boldDirty || (mode === "templates" && !!edited && !templateDoc);

  const generateClassMolblock = useCallback(
    (item: ClassStructureItem): string | null => {
      if (!rdkit) return null;
      // Dummies stay plain `*`/`R` atoms with atom maps — the only spelling
      // RDKit and OCL both survive. Labels are injected at draw time.
      const mol = rdkit.get_mol(item.smiles);
      if (!mol) return null;
      try {
        return mol.get_molblock();
      } catch {
        return null;
      } finally {
        mol.delete?.();
      }
    },
    [rdkit],
  );

  // Class mode: R positions are dummy atoms with atom maps in the source
  // molblock. OCL mangles their symbols/maps on every round-trip, so each edit
  // is normalized back against the source (coords kept, chemistry restored)
  // and display labels are injected at draw time by atom index. `classLabels`
  // is SOURCE-indexed: it feeds the canvas, which applies it once at load to
  // the source atoms.
  const classDummies = useMemo(
    () => (mode === "classes" && source ? parseClassDummies(source) : []),
    [mode, source],
  );
  const classLabels = useMemo(
    () =>
      mode === "classes" && selectedClass
        ? classAtomLabels(classDummies, selectedClass.rLabels)
        : undefined,
    [mode, selectedClass, classDummies],
  );
  // The preview (and the saved SVG) must show exactly what the canvas displays.
  // Every emission carries the labels OCL is currently drawing (it tracks
  // label-atom identity through edits), so once the user has edited, that map
  // is the display truth: labels persist on surviving dummies, vanish with
  // deleted ones, and never land on new atoms. Before any emission the canvas
  // shows the load-time map, so the preview does too. One shared path for all
  // modes — substance emissions simply carry an empty map.
  const previewAtomLabels = emissionLabels ?? classLabels;
  const handleEditorChange = useCallback(
    (molblock: string, displayedAtomLabels?: Record<number, string>) => {
      if (mode !== "classes" || !source) {
        setEmissionLabels(displayedAtomLabels ?? null);
        setEdited(molblock);
        return;
      }
      // Typed R-group conversion runs AFTER the dummy-tail restore on purpose:
      // normalize skips `R#` lines (not a dummy symbol), so retyping an existing
      // R position as R<n> in the ?… dialog can never get its old source tail
      // stamped back over the new map number.
      const rLabels = selectedClass?.rLabels ?? {};
      const { molblock: convertedMolblock, converted } = convertTypedRGroups(
        normalizeClassMolblock(molblock, source, classDummies),
        Object.keys(rLabels),
      );
      const convertedEntries = Object.entries(converted);
      if (displayedAtomLabels || convertedEntries.length > 0) {
        // A freshly converted atom carries no OCL custom label yet (the canvas
        // shows the typed "R<n>" until the next baseline load), so the preview —
        // the semantic truth — gets the class label stamped on alongside the
        // labels OCL is displaying.
        const labels: Record<number, string> = { ...displayedAtomLabels };
        for (const [index, mapNum] of convertedEntries) {
          const label = rLabels[mapNum];
          if (label) labels[Number(index)] = label;
        }
        setEmissionLabels(labels);
      } else {
        setEmissionLabels(null);
      }
      setEdited(convertedMolblock);
    },
    [mode, source, classDummies, selectedClass],
  );

  // Use the protected editor route for selected depictions, matching the save
  // target and the class-template read path. Browser Postgres reads still power
  // lightweight picker metadata, but the editable record must round-trip to the
  // same deployment that receives the save.
  useEffect(() => {
    const slug =
      selected && mode === "substances"
        ? selected
        : selected && mode === "classes"
          ? `class:${selected}`
          : selected && mode === "templates" && templateDoc === null
            ? `class:${selected}`
            : null;
    if (!slug) {
      setOverrideDoc(undefined);
      setOverrideLoadError(null);
      return;
    }
    let cancelled = false;
    setOverrideDoc(undefined);
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
  }, [mode, selected, templateDoc]);

  // Template reads use the same protected server route/Postgres target as saves,
  // so reopening a class round-trips the row even when public and editor Postgres
  // deployments are intentionally different.
  useEffect(() => {
    if (mode !== "templates" || !selected) {
      setTemplateDoc(undefined);
      setTemplateLoadError(null);
      return;
    }
    let cancelled = false;
    setTemplateDoc(undefined);
    setTemplateLoadError(null);
    void fetch(`${TEMPLATE_API}?classKey=${encodeURIComponent(selected)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          template?: MoleculeClassTemplate | null;
        };
        if (!response.ok) {
          throw new Error(body.error ?? `Template load failed (${response.status})`);
        }
        if (!cancelled) setTemplateDoc(body.template ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTemplateDoc(null);
        setTemplateLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selected]);

  // --- resolve the editor's source MOL block (published row or local SMILES preview) -
  useEffect(() => {
    if (!selected) {
      loadSource(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    // Every non-null baseline goes through `normalizeForComparison`, which needs
    // OCL. Waiting here (like the rdkit gate below) keeps a raw baseline from
    // being installed and then reloaded — wiping the canvas — once OCL arrives.
    if (!ocl) {
      setComputing(true);
      return;
    }
    // An explicit import wins in every mode, including over a loaded template.
    if (variant === "imported" && importedMolblock) {
      loadSource(importedMolblock);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (mode === "templates") {
      if (templateDoc === undefined) {
        loadSource(null);
        setNoStructure(false);
        setComputing(true);
        return;
      }
      if (templateDoc) {
        loadSource(templateDoc.molblock, { boldBonds: templateDoc.boldBonds ?? [] });
        setNoStructure(false);
      } else {
        loadSource(null);
        setNoStructure(true);
      }
      setComputing(false);
      return;
    }
    if (overrideDoc === undefined) {
      setComputing(true);
      return; // override still loading
    }
    if (variant === "saved" && overrideDoc) {
      loadSource(overrideDoc.molblock, { boldBonds: overrideDoc.boldBonds ?? [] });
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (mode === "classes") {
      if (!rdkit) {
        setComputing(true);
        return;
      }
      if (!selectedClass) {
        loadSource(null);
        setNoStructure(true);
        setComputing(false);
        return;
      }
      const molblock = generateClassMolblock(selectedClass);
      if (molblock) {
        loadSource(molblock);
        setNoStructure(false);
      } else {
        loadSource(null);
        setNoStructure(true);
      }
      setComputing(false);
      return;
    }
    if (articleLoading) {
      setComputing(true);
      return; // source still loading
    }
    if (!smiles) {
      loadSource(null);
      setNoStructure(true);
      setComputing(false);
      return;
    }
    let cancelled = false;
    setComputing(true);
    void smilesToMolblock(smiles).then((molblock) => {
      if (cancelled) return;
      if (molblock) {
        loadSource(molblock);
        setNoStructure(false);
      } else {
        loadSource(null);
        setNoStructure(true);
      }
      setComputing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    selected,
    variant,
    importedMolblock,
    overrideDoc,
    articleLoading,
    smiles,
    mode,
    ocl,
    rdkit,
    selectedClass,
    generateClassMolblock,
    templateDoc,
    loadSource,
  ]);

  const onSelect = useCallback(
    (slug: string) => {
      if (slug === selected) return;
      const run = () => {
        setSelected(slug);
        setVariant("saved");
        setImportedMolblock(null);
        setImportSlug(null);
        setPasteSmilesInput("");
        setBoldToggleActive(false);
        setMirrorDirection(null);
        setSnapRequest(null);
        setBondPickActive(false);
        setSelectedBondCount(0);
        setSaveResult(null);
        setCanvasError(null);
        setOverrideLoadError(null);
        setTemplateSmilesInput("");
        setTemplateMemberSlug(null);
        tracing.clear();
        if (mode === "templates") {
          setTemplateDoc(undefined);
          loadSource(null);
          setNoStructure(false);
        }
      };
      if (hasUnsavedChanges) {
        setConfirm({
          title: "Discard unsaved edits?",
          description:
            mode === "classes" || mode === "templates"
              ? "Switching to another class will discard the unsaved changes to this depiction."
              : "Switching to another substance will discard the unsaved changes to this depiction.",
          confirmLabel: "Discard and switch",
          destructive: true,
          onConfirm: run,
        });
      } else {
        run();
      }
    },
    [selected, hasUnsavedChanges, mode, tracing.clear],
  );

  const changeMode = useCallback(
    (nextMode: string) => {
      if (nextMode !== "substances" && nextMode !== "classes" && nextMode !== "templates") return;
      if (nextMode === mode) return;
      const run = () => {
        setMode(nextMode);
        setSelected(null);
        setMirrorDirection(null);
        setSnapRequest(null);
        setBondPickActive(false);
        setSelectedBondCount(0);
        setVariant("saved");
        setImportedMolblock(null);
        setImportSlug(null);
        setPasteSmilesInput("");
        setBoldToggleActive(false);
        loadSource(null);
        setSaveResult(null);
        setCanvasError(null);
        setOverrideLoadError(null);
        setNoStructure(false);
        setTemplateDoc(undefined);
        setTemplateLoadError(null);
        setTemplateSmilesInput("");
        setTemplateMemberSlug(null);
        tracing.clear();
      };
      if (hasUnsavedChanges) {
        setConfirm({
          title: "Discard unsaved edits?",
          description: "Switching editor modes will discard the unsaved changes to this depiction.",
          confirmLabel: "Discard and switch",
          destructive: true,
          onConfirm: run,
        });
      } else {
        run();
      }
    },
    [hasUnsavedChanges, mode, tracing.clear],
  );

  const initializeTemplateFromSmiles = useCallback(async () => {
    if (mode !== "templates") return;
    setInitializingTemplate(true);
    setSaveResult(null);
    const molblock = await smilesToMolblock(templateSmilesInput);
    if (!molblock) {
      setSaveResult({ tone: "danger", message: "That SMILES could not be parsed." });
      setInitializingTemplate(false);
      return;
    }
    const plainMolblock = await stripDummyAtoms(molblock);
    loadSource(plainMolblock, { force: true });
    setNoStructure(false);
    setInitializingTemplate(false);
  }, [mode, templateSmilesInput]);

  const initializeTemplateFromMember = useCallback(async () => {
    if (mode !== "templates" || !templateMemberSlug) return;
    setInitializingTemplate(true);
    setSaveResult(null);
    const molblock = templateMemberOverride?.molblock ?? null;
    if (!molblock) {
      setSaveResult({
        tone: "danger",
        message: "That member's current molecule depiction is unavailable.",
      });
      setInitializingTemplate(false);
      return;
    }
    const plainMolblock = await stripDummyAtoms(molblock);
    loadSource(plainMolblock, { force: true });
    setNoStructure(false);
    setInitializingTemplate(false);
  }, [mode, templateMemberOverride, templateMemberSlug]);

  const initializeTemplateFromClassStructure = useCallback(async () => {
    if (mode !== "templates" || !selectedClass) return;
    setInitializingTemplate(true);
    setSaveResult(null);

    // Prefer the class-page depiction's curated orientation. The generic class
    // editor's RDKit layout remains the fallback for classes without an override.
    const molblock = overrideDoc?.molblock ?? generateClassMolblock(selectedClass);
    if (!molblock) {
      setSaveResult({
        tone: "danger",
        message: "The class structure could not be generated.",
      });
      setInitializingTemplate(false);
      return;
    }

    const plainMolblock = await stripDummyAtoms(molblock);
    loadSource(plainMolblock, { force: true });
    setNoStructure(false);
    setInitializingTemplate(false);
  }, [generateClassMolblock, mode, overrideDoc, selectedClass]);

  /**
   * Load another saved depiction into the canvas as a starting point (Fig. 3) —
   * an analogue seed in substances mode, a scaffold seed in class and template
   * modes. Replaces the canvas — with confirmation over unsaved work — and
   * publishes nothing until the user edits and saves. Templates stay plain
   * scaffolds, so R-group dummy atoms are stripped on the way in.
   */
  const importFromSubstance = useCallback(async () => {
    if (!selected || !importSlug) return;
    const run = async () => {
      setImporting(true);
      setSaveResult(null);
      try {
        let molblock: string | undefined;
        if (importSlug.startsWith("template:")) {
          const classKey = importSlug.slice("template:".length);
          const response = await fetch(
            `${TEMPLATE_API}?classKey=${encodeURIComponent(classKey)}`,
          );
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            template?: MoleculeClassTemplate | null;
          };
          if (!response.ok) {
            throw new Error(body.error ?? `Import load failed (${response.status})`);
          }
          molblock = body.template?.molblock;
        } else {
          const response = await fetch(`${SAVE_API}?slug=${encodeURIComponent(importSlug)}`);
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            override?: MoleculeOverride | null;
          };
          if (!response.ok) {
            throw new Error(body.error ?? `Import load failed (${response.status})`);
          }
          molblock = body.override?.molblock;
        }
        if (!molblock) {
          throw new Error("That structure has no saved depiction to import.");
        }
        if (mode === "templates") {
          molblock = await stripDummyAtoms(molblock);
        }
        setImportedMolblock(molblock);
        setVariant("imported");
        setSaveResult({
          tone: "success",
          title: "Structure imported",
          message:
            mode === "substances"
              ? "The canvas now shows the imported structure. Edit it into this substance's molecule, then save."
              : "The canvas now shows the imported structure. Edit it into shape, then save.",
        });
      } catch (err) {
        setSaveResult({
          tone: "danger",
          title: "Couldn't import",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setImporting(false);
      }
    };
    if (hasUnsavedChanges) {
      setConfirm({
        title: "Replace the canvas?",
        description:
          "Importing that structure will discard the unsaved changes to this depiction.",
        confirmLabel: "Discard and import",
        destructive: true,
        onConfirm: () => void run(),
      });
    } else {
      await run();
    }
  }, [mode, selected, importSlug, hasUnsavedChanges]);

  /**
   * Seed the canvas from pasted SMILES (automatic layout — a starting point,
   * not a finished drawing). Same replace-with-confirmation contract as the
   * substance import above.
   */
  const importFromSmiles = useCallback(async () => {
    if (!selected || !pasteSmilesInput.trim()) return;
    const run = async () => {
      setImporting(true);
      setSaveResult(null);
      let molblock = await smilesToMolblock(pasteSmilesInput);
      if (!molblock) {
        setSaveResult({
          tone: "danger",
          title: "Couldn't use SMILES",
          message: "That SMILES could not be parsed.",
        });
        setImporting(false);
        return;
      }
      if (mode === "templates") {
        molblock = await stripDummyAtoms(molblock);
      }
      setImportedMolblock(molblock);
      setVariant("imported");
      setSaveResult({
        tone: "success",
        title: "Structure loaded from SMILES",
        message:
          "Automatic layout only. Expect to tidy the drawing before saving.",
      });
      setImporting(false);
    };
    if (hasUnsavedChanges) {
      setConfirm({
        title: "Replace the canvas?",
        description:
          "Loading a structure from SMILES will discard the unsaved changes to this depiction.",
        confirmLabel: "Discard and load",
        destructive: true,
        onConfirm: () => void run(),
      });
    } else {
      await run();
    }
  }, [mode, selected, pasteSmilesInput, hasUnsavedChanges]);

  // --- recompute preview + stereo guard on every edit (debounced) -----------
  useEffect(() => {
    if (!ocl || !edited) {
      setPreviewSvg(null);
      setGuard(null);
      return;
    }
    const id = setTimeout(() => {
      setPreviewSvg(renderMoleculeSvg(ocl, edited, previewAtomLabels, boldBonds));
      setGuard(
        !rdkit
          ? null
          : mode === "classes" || mode === "templates"
            ? source
              ? compareCanonicalSmiles(rdkit, source, edited)
              : null
            : smiles
              ? compareInchi(rdkit, smiles, edited)
              : null,
      );
    }, 120);
    return () => clearTimeout(id);
  }, [ocl, rdkit, edited, smiles, mode, source, previewAtomLabels, boldBonds]);

  // If Postgres never resolves, stop showing an indefinite "Loading…".
  useEffect(() => {
    if (pickerItems) {
      setLoadTimedOut(false);
      return;
    }
    const id = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [pickerItems]);

  // Auto-clear a success notice; errors stay until dismissed or superseded.
  useEffect(() => {
    if (saveResult?.tone !== "success") return;
    const id = setTimeout(() => setSaveResult(null), 6000);
    return () => clearTimeout(id);
  }, [saveResult]);

  // `edited` only diverges from `source` on a real user edit (OclEditor filters
  // programmatic loads), so this is a reliable dirty flag.
  const dirty = hasUnsavedChanges;
  const renderBlocked = !!oclError || !!rdkitError || !!canvasError;
  const enginesReady = !!ocl && !!rdkit;
  const canSave =
    enginesReady && dirty && !!edited && !!previewSvg && !saving && !noStructure && !renderBlocked;
  // Gates all whole-depiction transforms: the two mirror flips and both alignment rotations.
  const canTransform = enginesReady && !!edited && !saving && !noStructure && !renderBlocked;

  // Pick mode can't outlive the ability to transform (a save starting, the
  // structure unloading, or the canvas erroring mid-pick).
  useEffect(() => {
    if (!canTransform) {
      setBondPickActive(false);
      setBoldToggleActive(false);
    }
  }, [canTransform]);

  // Translate the canvas's alignment outcome into the shared notice slot. The failure
  // cases are mostly unreachable through the button gating, but the canvas is the
  // authority on canvas state, so they still get honest messages.
  const reportSnapOutcome = useCallback((outcome: MoleculeSnapOutcome) => {
    switch (outcome.status) {
      case "applied": {
        const degrees = Math.abs(outcome.degrees);
        const amount = `${degrees >= 10 ? degrees.toFixed(0) : degrees.toFixed(1)}°`;
        setSaveResult({
          tone: "success",
          title: "Aligned",
          message:
            outcome.kind === "bond-vertical"
              ? `Rotated ${amount}. The bond is now vertical. Save to publish.`
              : `Rotated ${amount} onto the standard 30° drawing grid. Save to publish.`,
        });
        return;
      }
      case "already-aligned":
        setSaveResult({
          tone: "success",
          title: "No rotation needed",
          message:
            outcome.kind === "bond-vertical"
              ? "That bond is already exactly vertical."
              : "Every bond already sits on the 30° drawing grid.",
        });
        return;
      case "canceled":
        // Pick mode dismissed without choosing a bond; nothing to report.
        return;
      case "no-bond-selected":
        setSaveResult({
          tone: "danger",
          title: "Select a bond first",
          message: "Press Set bond vertical, then click the bond on the canvas.",
        });
        return;
      case "multiple-bonds-selected":
        setSaveResult({
          tone: "danger",
          title: "Too many bonds selected",
          message: "Select exactly one bond so the editor knows which line to make vertical.",
        });
        return;
      case "no-bonds":
        setSaveResult({
          tone: "danger",
          title: "Nothing to straighten",
          message: "This depiction has no bonds to align to the drawing grid.",
        });
        return;
      case "failed":
        setSaveResult({
          tone: "danger",
          title: "Couldn't rotate",
          message: "The depiction couldn't be rotated. Reload the page and try again.",
        });
        return;
    }
  }, []);

  const onSnapComplete = useCallback(
    (outcome: MoleculeSnapOutcome) => {
      setSnapRequest(null);
      reportSnapOutcome(outcome);
    },
    [reportSnapOutcome],
  );

  const onBondPickComplete = useCallback(
    (outcome: MoleculeSnapOutcome) => {
      setBondPickActive(false);
      reportSnapOutcome(outcome);
    },
    [reportSnapOutcome],
  );

  // --- save / local auto preview / class-override removal ------------------
  const save = useCallback(async () => {
    if (!selected || !edited || !ocl) return;
    setSaving(true);
    setSaveResult(null);
    // Render the published SVG from `edited` right now — the debounced preview can
    // lag the newest edit, and the posted SVG is what the public article serves.
    const svg = renderMoleculeSvg(ocl, edited, previewAtomLabels, boldBonds);
    if (!svg) {
      setSaving(false);
      setSaveResult({
        tone: "danger",
        message: "The edited structure couldn't be rendered, so nothing was saved.",
      });
      return;
    }
    setPreviewSvg(svg);
    if (mode === "templates") {
      try {
        const res = await fetch(TEMPLATE_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classKey: selected,
            molblock: edited,
            ...(boldBonds.length > 0 ? { boldBonds } : {}),
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          updatedAt?: number;
          updatedBy?: string;
        };
        if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
        const savedTemplate = {
          classKey: selected,
          molblock: edited,
          ...(boldBonds.length > 0 ? { boldBonds } : {}),
          updatedAt: body.updatedAt ?? Date.now(),
          updatedBy: body.updatedBy,
        };
        setTemplateDoc(savedTemplate);
        markSourceSaved(edited);
        setBoldBaseline(boldBonds);
        setSaveResult({
          tone: "success",
          message: "Saved. The class template is ready for later preview and apply work.",
        });
      } catch (err) {
        setSaveResult({
          tone: "danger",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setSaving(false);
      }
      return;
    }
    const saveSlug = mode === "classes" ? `class:${selected}` : selected;
    try {
      const res = await fetch(SAVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: saveSlug,
          molblock: edited,
          svg,
          smiles,
          ...(boldBonds.length > 0 ? { boldBonds } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setOverrideDoc({
        slug: saveSlug,
        molblock: edited,
        svg,
        ...(smiles ? { smiles } : {}),
        ...(boldBonds.length > 0 ? { boldBonds } : {}),
        source: "editor",
        updatedAt: new Date().toISOString(),
      });
      setBoldBaseline(boldBonds);
      setVariant("saved");
      void invalidateEditorReads(["moleculeOverrides:listSlugs", "moleculeOverrides:getBySlug", "moleculeOverrides:getMetadataBySlug"]);
      setSaveResult({
        tone: "success",
        message:
          mode === "classes"
            ? "Saved. The override is live. The class page refreshes momentarily."
            : "Saved. This is now the live depiction. The substance page refreshes momentarily.",
      });
    } catch (err) {
      setSaveResult({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [selected, edited, ocl, smiles, mode, previewAtomLabels, boldBonds, invalidateEditorReads]);

  const revertToAuto = useCallback(() => {
    const run = () => {
      setVariant("auto");
      setSaveResult(null);
    };
    if (dirty) {
      setConfirm({
        title: "Discard unsaved edits?",
        description: "Reverting to the automatic layout will discard your unsaved changes.",
        confirmLabel: "Discard and revert",
        destructive: true,
        onConfirm: run,
      });
    } else {
      run();
    }
  }, [dirty]);

  const performRemove = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const removeSlug = mode === "classes" ? `class:${selected}` : selected;
      const res = await fetch(`${SAVE_API}?slug=${encodeURIComponent(removeSlug)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Remove failed (${res.status})`);
      setOverrideDoc(null);
      setVariant("auto");
      void invalidateEditorReads(["moleculeOverrides:listSlugs", "moleculeOverrides:getBySlug", "moleculeOverrides:getMetadataBySlug"]);
      setSaveResult({
        tone: "success",
        message: "Override removed. Reverted to the automatic layout.",
      });
    } catch (err) {
      setSaveResult({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [selected, mode, invalidateEditorReads]);

  // Removing an override is destructive: always confirm, and warn about unsaved edits too.
  const requestRemove = useCallback(() => {
    if (!selected) return;
    setConfirm({
      title: "Remove override?",
      description: dirty
        ? "This deletes the saved override and discards your unsaved edits, returning the molecule to the automatic layout."
        : "This deletes the saved override and returns the molecule to the automatic layout.",
      confirmLabel: "Remove override",
      destructive: true,
      onConfirm: () => {
        void performRemove();
      },
    });
  }, [selected, dirty, performRemove]);

  // ---------------------------------------------------------------------------
  return (
    <div className="mt-10 space-y-8">
      <MoleculeEditorModePanel
        mode={mode}
        onModeChange={changeMode}
        pickerItems={pickerItems}
        selected={selected}
        onSelect={onSelect}
        loadTimedOut={loadTimedOut}
        loadedCount={loadedCount}
        overrideCount={overrideCount}
        publishedCount={publishedCount}
        noStructure={noStructure}
        variant={variant}
        loadedFromOverride={loadedFromOverride}
        importableMolecules={importableMolecules}
        importSlug={importSlug}
        onImportSlugChange={setImportSlug}
        importing={importing}
        saving={saving}
        onImportStructure={() => void importFromSubstance()}
        pasteSmilesInput={pasteSmilesInput}
        onPasteSmilesInputChange={setPasteSmilesInput}
        onImportSmiles={() => void importFromSmiles()}
        templateLoadError={templateLoadError}
        overrideLoadError={overrideLoadError}
        templateDoc={templateDoc}
        source={source}
        templateSmilesInput={templateSmilesInput}
        onTemplateSmilesInputChange={setTemplateSmilesInput}
        onInitializeTemplateFromClass={() => void initializeTemplateFromClassStructure()}
        onInitializeTemplateFromSmiles={() => void initializeTemplateFromSmiles()}
        templateMemberItems={templateMemberItems}
        templateMemberSlug={templateMemberSlug}
        onTemplateMemberSlugChange={setTemplateMemberSlug}
        onInitializeTemplateFromMember={() => void initializeTemplateFromMember()}
        templateMemberReady={templateMemberReady}
        classStructureReady={!!selectedClass && overrideDoc !== undefined}
        initializingTemplate={initializingTemplate}
        rendererReady={!!ocl && !!rdkit}
        rendererError={oclError ?? rdkitError}
      />
      <MoleculeEditorWorkbench
        mode={mode}
        selected={selected}
        noStructure={noStructure}
        oclReady={!!ocl}
        rdkitReady={!!rdkit}
        oclError={oclError}
        rdkitError={rdkitError}
        canvasError={canvasError}
        onCanvasError={setCanvasError}
        source={source}
        sourceEpoch={sourceEpoch}
        atomLabels={classLabels}
        onEditorChange={handleEditorChange}
        fineRotation={fineRotation}
        onFineRotationChange={setFineRotation}
        mirrorDirection={mirrorDirection}
        onMirrorDirectionChange={setMirrorDirection}
        snapRequest={snapRequest}
        onSnapRequestChange={setSnapRequest}
        onSnapComplete={onSnapComplete}
        selectedBondCount={selectedBondCount}
        onSelectedBondCountChange={setSelectedBondCount}
        bondPickActive={bondPickActive}
        onBondPickActiveChange={setBondPickActive}
        onBondPickComplete={onBondPickComplete}
        boldBonds={boldBonds}
        onBoldBondsChange={setBoldBonds}
        boldToggleActive={boldToggleActive}
        onBoldToggleActiveChange={setBoldToggleActive}
        tracing={tracing}
        computing={computing}
        previewSvg={previewSvg}
        guard={guard}
        smiles={smiles}
        saving={saving}
        dirty={dirty}
        renderBlocked={renderBlocked}
        canTransform={canTransform}
        canSave={canSave}
        hasOverride={hasOverride}
        templateDoc={templateDoc}
        templatePreparing={templateApplication.preparing}
        onPrepareTemplate={() => void templateApplication.prepare()}
        onRevert={revertToAuto}
        onRequestRemove={requestRemove}
        onSave={() => void save()}
        saveResult={saveResult}
        onDismissSaveResult={() => setSaveResult(null)}
      />

      <TemplateApplyDialog
        open={templateApplication.open}
        classLabel={selectedTemplateLabel}
        rows={templateApplication.rows}
        includedSlugs={templateApplication.includedSlugs}
        preparing={templateApplication.preparing}
        applying={templateApplication.applying}
        error={templateApplication.error}
        results={templateApplication.results}
        onOpenChange={templateApplication.onOpenChange}
        onToggle={templateApplication.toggle}
        onConfirm={() => void templateApplication.confirm()}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
