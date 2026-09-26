"use client";

/**
 * One open structure in the molecule editor: the pane of the Molecules
 * workspace. `MoleculeEditorTab` keys this component on `mode:selected`, so
 * every field below belongs to exactly one selection and a switch starts from a
 * clean slate without a reset list.
 *
 *   • header: the record's name, key, where its drawing comes from, last save
 *   • canvas: OpenChemLib editor behind a labeled dose.wiki tool strip: reposition
 *     atoms (Select), set per-bond wedge/hash stereo; an "Adjust" row above it holds
 *     the whole-depiction transforms
 *   • preview and settings: live brand-styled preview rendered by the same OpenChemLib
 *     engine as the canvas, plus fine rotation, tracing and the canvas key legend
 *   • starting points: another saved structure, pasted SMILES (and a template's first start)
 *   • save dock: result of the last write, RDKit-backed stereo guard, why Save is off,
 *     Save (asks first when it publishes), Revert to saved, Revert to auto
 *
 * Data is live Postgres, so this works on the deployed admin host (not just locally):
 *   • per-substance SMILES come from the `substanceIndex` queries
 *   • the starting structure is the published `moleculeOverrides` MOL block (including
 *     seeded auto-layout baselines); Revert to auto regenerates a local SMILES layout
 *   • Save POSTs to the editor-gated `/api/dev/molecule-override` route, which writes
 *     Postgres + revalidates the public page; Remove override DELETEs the saved row
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorRead, useInvalidateEditorReads } from "@/hooks/useEditorRead";
import {
  Notice,
  isWriteFreezeRefusal,
  useConfirm,
  useDevShortcuts,
  useUnsavedWork,
  useWriteFreeze,
} from "@/features/dev/components";
import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import type { InchiComparison } from "./stereoGuard";
import { compareCanonicalSmiles, compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import type {
  MoleculeMirrorDirection,
  MoleculeSnapKind,
  MoleculeSnapOutcome,
} from "./moleculeTransforms";
import type { UseOclResult } from "./useOcl";
import type { UseRdkitResult } from "./useRdkit";
import {
  classAtomLabels,
  convertTypedRGroups,
  normalizeClassMolblock,
  parseClassDummies,
  stripOclCustomLabelSgroups,
} from "./applyRLabelsToMolblock";
import { CLASS_STRUCTURES, type ClassStructureItem } from "./classStructures";
import { buildClassTemplateMemberOptions } from "./classTemplateOptions";
import type { MoleculePickerItem } from "./moleculePickerOrdering";
import { stripDummyAtoms } from "./stripDummyAtoms";
import { TemplateApplyDialog } from "./TemplateApplyDialog";
import { useTracingLayer } from "./TracingLayer";
import { useTemplateApplication } from "./useTemplateApplication";
import { useMoleculeSourceReadState } from "./useMoleculeSourceRead";
import { useMoleculePickerReadState } from "./useMoleculePickerRead";
import { matchesTypedName } from "./chemistryDiff";
import { MoleculeLoadNotices, MoleculeStartingPoints } from "./MoleculeEditorModePanel";
import { TemplateInitialization } from "./MoleculeEditorPickers";
import { MoleculeEditorWorkbench, MoleculeIdlePane, type MoleculePaneRecord } from "./MoleculeEditorWorkbench";
import { MoleculePublishReview } from "./MoleculeEditorWorkbenchStatus";
import { depictionStateOf } from "./moleculeListModel";
import type {
  EditorMode,
  MoleculeClassTemplate,
  MoleculeOverride,
  SaveResult,
} from "./moleculeEditorTypes";

const SAVE_API = "/api/dev/molecule-override";
const TEMPLATE_API = "/api/dev/molecule-class-template";

const OVERRIDE_READS = [
  "moleculeOverrides:listSlugs",
  "moleculeOverrides:getBySlug",
  "moleculeOverrides:getMetadataBySlug",
] as const;

export interface MoleculeEditorSessionProps {
  mode: EditorMode;
  selected: string | null;
  /** What the list knows about the open record: its name and stored state. */
  listRecord: MoleculePaneRecord | null;
  /** True while the list is still loading, for the idle pane's words. */
  listLoading: boolean;
  onClose: () => void;
  onBackToList: () => void;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  /** Reports whether this session holds unsaved work, so the tab can ask before switching. */
  onDirtyChange: (dirty: boolean) => void;
  engines: {
    ocl: UseOclResult["ocl"];
    oclError: string | null;
    rdkit: UseRdkitResult["rdkit"];
    rdkitError: string | null;
  };
  fineRotation: boolean;
  onFineRotationChange: (enabled: boolean) => void;
  loadTimedOut: boolean;
  molecules: MoleculePickerItem[] | null;
  classTemplates: MoleculePickerItem[];
  importableMolecules: MoleculePickerItem[] | null;
  overrideSet: ReadonlySet<string>;
}

export function MoleculeEditorSession({
  mode,
  selected,
  listRecord,
  listLoading,
  onClose,
  onBackToList,
  titleRef,
  onDirtyChange,
  engines: { ocl, oclError, rdkit, rdkitError },
  fineRotation,
  onFineRotationChange,
  loadTimedOut,
  molecules,
  classTemplates,
  importableMolecules,
  overrideSet,
}: MoleculeEditorSessionProps) {
  // "saved" shows the published Postgres row; "auto" is an unsaved SMILES preview;
  // "imported" is another substance's depiction loaded as an analogue starting point.
  const [variant, setVariant] = useState<"saved" | "auto" | "imported">("saved");
  // The imported MOL block backing the "imported" variant (canvas-only until Save).
  const [importedMolblock, setImportedMolblock] = useState<string | null>(null);
  const [importSlug, setImportSlug] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pasteSmilesInput, setPasteSmilesInput] = useState("");

  // `source` is the MOL block fed INTO the editor (changes on load / revert only);
  // `edited` is the live MOL block coming OUT of the editor (drives preview + guard + save).
  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  // Labels reported by the canvas alongside the latest emission, the display
  // truth of what OCL currently draws, keyed by that emission's atom indices.
  // null until the first edit after a baseline load (the canvas then shows the
  // load-time `classLabels` map, so the preview falls back to it).
  const [emissionLabels, setEmissionLabels] = useState<Record<number, string> | null>(null);
  // Bumped on every baseline load. The canvas is uncontrolled once loaded, so an
  // equal `source` string, which React's setState skips, would not reload it;
  // the epoch is what makes "reset `edited`" and "reload the canvas" one step.
  const [sourceEpoch, setSourceEpoch] = useState(0);
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
  // Typed confirmation that unlocks publishing a structure whose chemistry changed.
  const [confirmName, setConfirmName] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  // Set when the OpenChemLib canvas fails to construct; blocks Save like rdkitError.
  const [canvasError, setCanvasError] = useState<string | null>(null);
  // Destructive / discard confirmations rendered through the kit Dialog.
  const { confirm: requestConfirm, dialog: confirmDialog } = useConfirm();
  const [templateDoc, setTemplateDoc] = useState<MoleculeClassTemplate | null | undefined>(
    undefined,
  );
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);
  const [templateSmilesInput, setTemplateSmilesInput] = useState("");
  const [templateMemberSlug, setTemplateMemberSlug] = useState<string | null>(null);
  const [initializingTemplate, setInitializingTemplate] = useState(false);
  const [overrideDoc, setOverrideDoc] = useState<MoleculeOverride | null | undefined>(undefined);
  const [overrideLoadError, setOverrideLoadError] = useState<string | null>(null);
  // Bumped to read the stored depiction again (Try again, Load the latest version).
  const [overrideReload, setOverrideReload] = useState(0);
  // Set by Load the latest version, so the next stored read replaces the canvas even when unchanged.
  const forceNextLoad = useRef(false);
  const freeze = useWriteFreeze();
  const saveKeyLabel = useModifierKeyLabel("S");
  // See-through reference image over the canvas; session-only, never saved.
  const tracing = useTracingLayer();
  // --- live server data -----------------------------------------------------
  const invalidateEditorReads = useInvalidateEditorReads();
  const moleculeSourceRead = useMoleculeSourceReadState(
    selected && mode === "substances" ? selected : null,
  );
  const moleculeSource = moleculeSourceRead.data;
  // Only the loading/loaded transition may re-resolve the baseline. A polled
  // source read can redeliver equal data without replacing a dirty canvas.
  const articleLoading = moleculeSource === undefined && !moleculeSourceRead.error;
  const sourceRef = useRef<string | null>(null);

  /**
   * Re-express a molblock in the exact textual form the canvas emits: the same
   * OCL parse → `toMolfile` round-trip `OclEditor` performs, followed by the
   * same custom-label S-group strip and dummy-atom chemistry restoration
   * `OclEditor`/`handleEditorChange` apply (both no-ops for substance
   * molblocks, which have no labels or dummies). Baselines installed in this
   * form compare string-equal to a zero-edit canvas emission, so
   * `edited !== source`, the unsaved-changes flag, only trips on a real edit,
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
   * looking at a drawing that no longer exists in the state Save publishes:
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
  const classMembershipRead = useMoleculePickerReadState(
    mode === "templates" && !!selected,
    selected,
  );
  const classMembershipInput = classMembershipRead.data;
  const selectedTemplateLabel =
    classTemplates.find((item) => item.slug === selected)?.title ?? selected ?? "class";

  const selectedClass = useMemo<ClassStructureItem | null>(
    () => CLASS_STRUCTURES.find((item) => item.key === selected) ?? null,
    [selected],
  );
  const smiles = mode === "classes" ? selectedClass?.smiles ?? "" : moleculeSource?.smiles ?? "";
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
      // Dummies stay plain `*`/`R` atoms with atom maps, the only spelling
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
  // modes, substance emissions simply carry an empty map.
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
        // shows the typed "R<n>" until the next baseline load), so the preview:
        // the semantic truth, gets the class label stamped on alongside the
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
  }, [mode, selected, templateDoc, overrideReload]);

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
    // being installed and then reloaded, wiping the canvas, once OCL arrives.
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
      const force = forceNextLoad.current;
      forceNextLoad.current = false;
      loadSource(overrideDoc.molblock, { force, boldBonds: overrideDoc.boldBonds ?? [] });
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
   * Load another saved depiction into the canvas as a starting point (Fig. 3):
   * an analogue seed in substances mode, a scaffold seed in class and template
   * modes. Replaces the canvas, with confirmation over unsaved work, and
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
      requestConfirm({
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
  }, [mode, selected, importSlug, hasUnsavedChanges, requestConfirm]);

  /**
   * Seed the canvas from pasted SMILES (automatic layout, a starting point,
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
      requestConfirm({
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
  }, [mode, selected, pasteSmilesInput, hasUnsavedChanges, requestConfirm]);

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

  // Auto-clear a success notice; errors stay until dismissed or superseded.
  useEffect(() => {
    if (saveResult?.tone !== "success") return;
    const id = setTimeout(() => setSaveResult(null), 6000);
    return () => clearTimeout(id);
  }, [saveResult]);

  // `edited` only diverges from `source` on a real user edit (OclEditor filters
  // programmatic loads), so this is a reliable dirty flag.
  const dirty = hasUnsavedChanges;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const renderBlocked = !!oclError || !!rdkitError || !!canvasError;
  const enginesReady = !!ocl && !!rdkit;
  // Changed chemistry on a live depiction (substance or class) publishes only
  // after the chemist types its name; templates are not live, so they skip it.
  const publishName =
    mode === "substances"
      ? molecules?.find((item) => item.slug === selected)?.title ?? selected
      : mode === "classes"
        ? selectedClass?.label ?? selected
        : null;
  // The open depiction reports to the shell. A substance or class save is the
  // live depiction, and even a template save waits on the chemistry checks
  // here, so the shell only discards: the canvas reloads its baseline.
  useUnsavedWork({
    id: "molecule-editor",
    label: `Molecules: ${publishName ?? selected ?? "open depiction"}`,
    dirty,
    publishesLive: mode !== "templates",
    discard: () => {
      if (!saving) loadSource(source, { force: true, boldBonds: boldBaseline });
    },
  });
  const chemistryChanged = guard != null && !guard.match;
  const chemistryConfirmed =
    !chemistryChanged || !publishName || matchesTypedName(confirmName, publishName);
  const canSave =
    enginesReady &&
    dirty &&
    !!edited &&
    !!previewSvg &&
    !saving &&
    !noStructure &&
    !renderBlocked &&
    chemistryConfirmed;
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
    // Render the published SVG from `edited` right now, the debounced preview can
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
        if (isWriteFreezeRefusal(res.status, body) || (res.status >= 500 && freeze.frozen)) {
          setSaveResult(frozenResult("saved"));
          return;
        }
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
          title: "Template saved",
          message: "Nothing public changed. Use Apply to class to preview it on each member.",
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
    // The revision this editor loaded: the stored updatedAt, or null when no
    // depiction existed. The route answers 409 when someone saved since.
    const expectedUpdatedAt =
      overrideDoc === undefined ? undefined : overrideDoc ? overrideDoc.updatedAt : null;
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
          ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        updatedAt?: string;
        updatedBy?: string;
        conflict?: { updatedAt?: string | null; updatedBy?: string | null };
      };
      if (res.status === 409) {
        // Nothing was written; the edit stays on the canvas.
        const who = body.conflict?.updatedBy || "Someone";
        setSaveResult({
          tone: "danger",
          kind: "conflict",
          title: "Someone saved first",
          message: `${who} saved this depiction after you opened it, so nothing was published. Your edit is still on the canvas. Load the latest version to see theirs before saving again; that drops your edit.`,
        });
        return;
      }
      if (isWriteFreezeRefusal(res.status, body) || (res.status >= 500 && freeze.frozen)) {
        setSaveResult(frozenResult("published"));
        return;
      }
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setOverrideDoc({
        slug: saveSlug,
        molblock: edited,
        svg,
        ...(smiles ? { smiles } : {}),
        ...(boldBonds.length > 0 ? { boldBonds } : {}),
        source: "editor",
        updatedAt: body.updatedAt ?? new Date().toISOString(),
        ...(body.updatedBy ? { updatedBy: body.updatedBy } : {}),
      });
      setBoldBaseline(boldBonds);
      setConfirmName("");
      setVariant("saved");
      void invalidateEditorReads([...OVERRIDE_READS]);
      setSaveResult({
        tone: "success",
        title: "Published",
        message:
          mode === "classes"
            ? "Saved. The class depiction is live; the class page refreshes in a moment."
            : "Saved. This is now the live depiction; the article refreshes in a moment.",
      });
    } catch (err) {
      setSaveResult({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [
    selected,
    edited,
    ocl,
    smiles,
    mode,
    previewAtomLabels,
    boldBonds,
    overrideDoc,
    invalidateEditorReads,
    freeze.frozen,
  ]);

  const revertToAuto = useCallback(() => {
    const run = () => {
      setVariant("auto");
      setSaveResult(null);
    };
    if (dirty) {
      requestConfirm({
        title: "Discard unsaved edits?",
        description: "Reverting to the automatic layout will discard your unsaved changes.",
        confirmLabel: "Discard and revert",
        destructive: true,
        onConfirm: run,
      });
    } else {
      run();
    }
  }, [dirty, requestConfirm]);

  // Back to what is stored: the saved row when there is one, else the
  // baseline this session loaded. Never writes anything.
  const canRevertToSaved =
    !!selected && !noStructure && (dirty || (variant !== "saved" && (hasOverride || variant === "imported")));
  const revertToSaved = useCallback(() => {
    const run = () => {
      setSaveResult(null);
      setConfirmName("");
      setImportedMolblock(null);
      setVariant("saved");
      if (mode !== "templates" && overrideDoc) {
        loadSource(overrideDoc.molblock, { force: true, boldBonds: overrideDoc.boldBonds ?? [] });
      } else if (variant !== "imported") {
        loadSource(source, { force: true, boldBonds: boldBaseline });
      }
    };
    if (dirty) {
      requestConfirm({
        title: "Discard unsaved edits?",
        description: "Reverting to the saved depiction will discard your unsaved changes.",
        confirmLabel: "Discard and revert",
        destructive: true,
        onConfirm: run,
      });
    } else {
      run();
    }
  }, [boldBaseline, dirty, loadSource, mode, overrideDoc, requestConfirm, source, variant]);

  const performRemove = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const removeSlug = mode === "classes" ? `class:${selected}` : selected;
      const res = await fetch(`${SAVE_API}?slug=${encodeURIComponent(removeSlug)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (isWriteFreezeRefusal(res.status, body) || (res.status >= 500 && freeze.frozen)) {
        setSaveResult({ ...frozenResult("removed"), message: "Writes are paused, so the depiction was not removed. It is still live." });
        return;
      }
      if (!res.ok) throw new Error(body.error ?? `Remove failed (${res.status})`);
      setOverrideDoc(null);
      setVariant("auto");
      void invalidateEditorReads([...OVERRIDE_READS]);
      setSaveResult({
        tone: "success",
        title: "Removed",
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
  }, [selected, mode, invalidateEditorReads, freeze.frozen]);

  // Removing an override is destructive: always confirm, and warn about unsaved edits too.
  const requestRemove = useCallback(() => {
    if (!selected) return;
    const name = publishName ?? selected;
    requestConfirm({
      title: `Remove the ${name} depiction?`,
      description: dirty
        ? "This deletes the saved override and discards your unsaved edits, returning the molecule to the automatic layout. There is no undo."
        : "This deletes the saved override and returns the molecule to the automatic layout. There is no undo.",
      confirmLabel: "Remove override",
      destructive: true,
      onConfirm: () => {
        void performRemove();
      },
    });
  }, [selected, dirty, performRemove, requestConfirm, publishName]);

  // Live saves ask first and show the drawing that goes live beside the one
  // that is live now; a template publishes nothing, so it saves at once.
  const liveNow = mode === "templates" ? null : overrideDoc?.svg ?? null;
  const changedParts = useMemo(() => {
    const parts: string[] = [];
    if (edited !== source) parts.push("the drawing");
    if (boldDirty) parts.push("the bold bonds");
    return parts;
  }, [edited, source, boldDirty]);
  const requestSave = useCallback(() => {
    if (!canSave) return;
    if (mode === "templates") {
      void save();
      return;
    }
    const name = publishName ?? selected ?? "this structure";
    requestConfirm({
      title: chemistryChanged ? `Publish changed chemistry for ${name}?` : `Publish the ${name} depiction?`,
      description: `${
        changedParts.length ? `You changed ${changedParts.join(" and ")}. ` : ""
      }${
        variant === "imported"
          ? "The canvas holds an imported structure. "
          : variant === "auto"
            ? "The canvas holds the automatic layout. "
            : ""
      }${
        mode === "classes"
          ? "It replaces the class depiction on the class page as soon as it saves."
          : "It replaces the structure on the public article as soon as it saves."
      }`,
      body: (
        <MoleculePublishReview
          before={liveNow}
          after={previewSvg}
          chemistryChanged={chemistryChanged}
          beforeEmpty={mode === "classes" ? "No saved class depiction yet" : "No depiction yet: the article shows none"}
        />
      ),
      confirmLabel: chemistryChanged ? "Publish changed chemistry" : mode === "classes" ? "Publish class depiction" : "Publish depiction",
      destructive: chemistryChanged,
      wide: true,
      onConfirm: () => save(),
    });
  }, [canSave, mode, save, publishName, selected, requestConfirm, chemistryChanged, changedParts, variant, liveNow, previewSvg]);

  // Cmd/Ctrl+S asks the same way the button does, and never saves past a confirm.
  useDevShortcuts(SAVE_SHORTCUTS, !!selected);
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      requestSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, requestSave]);

  // Someone saved first: read the stored depiction again and put it on the
  // canvas, dropping the edit after a confirm that says so.
  const loadLatest = useCallback(() => {
    const run = () => {
      forceNextLoad.current = true;
      setSaveResult(null);
      setConfirmName("");
      setImportedMolblock(null);
      setVariant("saved");
      setOverrideReload((key) => key + 1);
    };
    requestConfirm({
      title: "Load the latest version?",
      description: "The canvas reloads the depiction someone else saved. Your edits on the canvas are dropped.",
      confirmLabel: "Drop my edits and load",
      destructive: true,
      onConfirm: run,
    });
  }, [requestConfirm]);

  // The one reason Save is off while there is something to save.
  const saveBlocker = useMemo(() => {
    if (saving || !selected || noStructure) return null;
    if (!dirty && !chemistryChanged) return null;
    if (renderBlocked) return "The renderer or the structure editor failed to load, so saving is off. Reload the page.";
    if (!enginesReady) return "Waiting for the drawing engine to load.";
    if (chemistryChanged && !chemistryConfirmed && publishName) {
      return `This is a different molecule now. Type ${publishName} under Changed chemistry to publish it.`;
    }
    if (!previewSvg) return "Rendering the preview.";
    return null;
  }, [saving, selected, noStructure, dirty, chemistryChanged, renderBlocked, enginesReady, chemistryConfirmed, publishName, previewSvg]);

  if (!selected) {
    return (
      <>
        <MoleculeIdlePane mode={mode} loading={listLoading && !loadTimedOut} />
        {confirmDialog}
      </>
    );
  }

  const record: MoleculePaneRecord = {
    title:
      listRecord?.title ??
      (mode === "classes" ? selectedClass?.label : mode === "templates" ? selectedTemplateLabel : publishName) ??
      selected,
    slug: selected,
    publiclyListed: listRecord?.publiclyListed,
    ...(mode === "templates"
      ? {
          depiction: templateDoc ? "saved" : templateDoc === null ? "none" : listRecord?.depiction ?? "none",
          savedAt: templateDoc?.updatedAt ?? listRecord?.savedAt ?? null,
          savedBy: templateDoc?.updatedBy ?? null,
        }
      : overrideDoc === undefined
        ? { depiction: listRecord?.depiction ?? "none", savedAt: listRecord?.savedAt ?? null, savedBy: null }
        : {
            depiction: overrideDoc ? depictionStateOf({ source: overrideDoc.source }, true) : "none",
            savedAt: overrideDoc?.updatedAt ?? null,
            savedBy: overrideDoc?.updatedBy ?? null,
          }),
  };
  const canvasSource =
    variant === "imported"
      ? "Imported structure, not saved"
      : loadedFromOverride
        ? mode === "templates"
          ? "Saved template"
          : mode === "classes"
            ? "Saved class depiction"
            : "Saved depiction"
        : mode === "templates"
          ? "New template, not saved"
          : "Automatic layout, not saved";

  return (
    <>
      <MoleculeEditorWorkbench
        mode={mode}
        record={record}
        canvasSource={canvasSource}
        titleRef={titleRef}
        onClose={onClose}
        onBackToList={onBackToList}
        engineStatus={oclError || rdkitError ? "failed" : ocl && rdkit ? "ready" : "loading"}
        lead={
          <>
            {mode === "substances" && moleculeSource === null && overrideDoc === null ? (
              <Notice
                tone="warning"
                title="Nothing is listed at this address"
                message={`No substance is saved as “${selected}”. It may have been renamed or removed; pick one from the list.`}
              />
            ) : null}
            <MoleculeLoadNotices
              mode={mode}
              templateLoadError={templateLoadError}
              overrideLoadError={overrideLoadError}
              onRetryOverride={() => setOverrideReload((key) => key + 1)}
              sourceError={moleculeSourceRead.error}
              onRetrySource={moleculeSourceRead.retry}
              membersError={classMembershipRead.error}
              onRetryMembers={classMembershipRead.retry}
            />
            {mode === "templates" && templateDoc === null && !source && !templateLoadError ? (
              <TemplateInitialization
                onUseClassStructure={() => void initializeTemplateFromClassStructure()}
                smiles={templateSmilesInput}
                onSmilesChange={setTemplateSmilesInput}
                onUseSmiles={() => void initializeTemplateFromSmiles()}
                members={templateMemberItems}
                membersLoading={classMembershipInput === undefined && !classMembershipRead.error}
                selectedMember={templateMemberSlug}
                onSelectMember={setTemplateMemberSlug}
                onUseMember={() => void initializeTemplateFromMember()}
                memberReady={templateMemberReady}
                classStructureReady={!!selectedClass && overrideDoc !== undefined}
                busy={initializingTemplate}
              />
            ) : null}
          </>
        }
        startingPoints={
          // An uninitialized template has its own three starts at the top of the pane.
          mode === "templates" && templateDoc === null && !source ? null : <MoleculeStartingPoints
            mode={mode}
            importableMolecules={importableMolecules}
            importSlug={importSlug}
            onImportSlugChange={setImportSlug}
            importing={importing}
            saving={saving}
            loadTimedOut={loadTimedOut}
            onImportStructure={() => void importFromSubstance()}
            pasteSmilesInput={pasteSmilesInput}
            onPasteSmilesInputChange={setPasteSmilesInput}
            onImportSmiles={() => void importFromSmiles()}
            onRevertToAuto={revertToAuto}
            canRevertToAuto={!noStructure && !saving && !!smiles}
          />
        }
        noStructure={noStructure}
        oclReady={!!ocl}
        oclError={oclError}
        rdkitError={rdkitError}
        canvasError={canvasError}
        onCanvasError={setCanvasError}
        source={source}
        sourceEpoch={sourceEpoch}
        atomLabels={classLabels}
        onEditorChange={handleEditorChange}
        fineRotation={fineRotation}
        onFineRotationChange={onFineRotationChange}
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
        saveBlocker={saveBlocker}
        hasOverride={hasOverride}
        templateDoc={templateDoc}
        templatePreparing={templateApplication.preparing}
        canPrepareTemplate={!dirty && !saving && !!rdkit && !!ocl && !templateApplication.preparing}
        onPrepareTemplate={() => void templateApplication.prepare()}
        onRevertToSaved={revertToSaved}
        canRevertToSaved={canRevertToSaved}
        onRequestRemove={requestRemove}
        onSave={requestSave}
        saveKeyLabel={saveKeyLabel}
        publishName={publishName}
        confirmName={confirmName}
        onConfirmNameChange={setConfirmName}
        saveResult={saveResult}
        onDismissSaveResult={() => setSaveResult(null)}
        onLoadLatest={loadLatest}
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
      {confirmDialog}
    </>
  );
}

const SAVE_SHORTCUTS = [
  { keys: "Cmd+S", label: "Save the open structure (asks first when it goes live)" },
] as const;

/** A write refused by the freeze: nothing landed, the edit stays on the canvas. */
function frozenResult(verb: "published" | "saved" | "removed"): SaveResult {
  return {
    tone: "danger",
    kind: "frozen",
    title: verb === "removed" ? "Not removed" : verb === "saved" ? "Not saved" : "Not published",
    message: `Writes are paused, so your changes were not ${verb}. Your edit is still on the canvas.`,
  };
}
