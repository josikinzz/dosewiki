"use client";

/**
 * Molecule depiction editor (`/dev` → Molecules).
 *
 * Fix the wedge/hash stereo bonds and atom positions of a molecule's skeletal diagram
 * when the automatic layout draws them badly.
 *   • picker — searchable substance combobox, publicly listed articles first and
 *     grouped by category (a "saved" pill marks molecules that already have a
 *     Convex depiction; "published" marks a publicly listed article)
 *   • canvas — OpenChemLib editor: reposition atoms (lasso tool), set per-bond
 *     wedge/hash stereo
 *   • control strip — live brand-styled preview rendered by the same OpenChemLib
 *     engine as the canvas + RDKit-backed stereo guard + Save / Revert; a side
 *     rail at xl widths, a sticky bottom toolbar below that
 *
 * Data is live Convex, so this works on the deployed admin host (not just locally):
 *   • the picker + per-substance SMILES come from the `substanceIndex` queries
 *   • the starting structure is the published `moleculeOverrides` MOL block (including
 *     seeded auto-layout baselines); Revert to auto regenerates a local SMILES layout
 *   • Save POSTs to the editor-gated `/api/dev/molecule-override` route, which writes
 *     Convex + revalidates the public substance page
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useSubstanceLookup } from "@/hooks/useSubstanceLookup";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { Button, Input, Surface } from "@/components/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  EditorCheckbox,
  EditorSegmentedControl,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";
import type { InchiComparison } from "./stereoGuard";
import { compareCanonicalSmiles, compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import {
  OclEditor,
  type MoleculeMirrorDirection,
  type MoleculeSnapKind,
  type MoleculeSnapOutcome,
} from "./OclEditor";
import { useOcl } from "./useOcl";
import { useRdkit } from "./useRdkit";
import {
  classAtomLabels,
  normalizeClassMolblock,
  parseClassDummies,
} from "./applyRLabelsToMolblock";
import { CLASS_STRUCTURES, type ClassStructureItem } from "./classStructures";
import {
  buildClassTemplateMemberOptions,
  CLASS_TEMPLATE_OPTIONS,
} from "./classTemplateOptions";
import {
  buildSubstancePickerItems,
  groupMoleculePickerItems,
  type MoleculePickerItem,
} from "./moleculePickerOrdering";
import { stripDummyAtoms } from "./stripDummyAtoms";
import { TemplateApplyDialog } from "./TemplateApplyDialog";
import { TracingControls, TracingOverlay, useTracingLayer } from "./TracingLayer";
import { useTemplateApplication } from "./useTemplateApplication";

type EditorMode = "substances" | "classes" | "templates";

interface MoleculeClassTemplate {
  classKey: string;
  molblock: string;
  boldBonds?: number[];
  updatedAt: number;
  updatedBy?: string;
}

interface MoleculeOverride {
  slug: string;
  molblock: string;
  svg: string;
  smiles?: string;
  boldBonds?: number[];
  source?: "seeded" | "editor" | "template";
  updatedAt: string;
  updatedBy?: string;
}

/** A pending confirmation surfaced through the shared kit Dialog. */
interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/** The outcome notice for the last Save, Remove, or canvas alignment action. */
interface SaveResult {
  tone: "success" | "danger";
  /** Notice heading; defaults to the Save wording when absent. */
  title?: string;
  message: string;
}

const SAVE_API = "/api/dev/molecule-override";
const TEMPLATE_API = "/api/dev/molecule-class-template";

/**
 * The two picker pills answer different questions: one is about the depiction
 * row, the other about the article. They used to share the word "published",
 * which read as "this article is live" on 117 substances that are not listed.
 */
const SAVED_PILL_TITLE = "Saved molecule depiction in Convex";
const PUBLISHED_PILL_TITLE = "Article is publicly listed on the site";

/** If Convex data has not arrived after this long, stop promising "Loading…". */
const LOAD_TIMEOUT_MS = 8000;
const SEARCH_INPUT_PAGE_SIZE = 32;

/** Pull the article's SMILES from whichever shape the Convex doc carries. */
function extractSmiles(article: unknown): string {
  const a = article as { identification?: { smiles?: unknown } } | null | undefined;
  const smiles = a?.identification?.smiles;
  return typeof smiles === "string" ? smiles.trim() : "";
}

export function MoleculeEditorTab({ initialSlug }: { initialSlug?: string } = {}) {
  // OpenChemLib renders the preview + published SVG (same engine as the canvas);
  // RDKit remains for the InChI/canonical-SMILES guards and class layout.
  const { ocl, error: oclError } = useOcl();
  const { rdkit, error: rdkitError } = useRdkit();

  const [mode, setMode] = useState<EditorMode>("substances");
  // Deep links (`/dev/molecules/{slug}`) land with the substance preselected.
  const [selected, setSelected] = useState<string | null>(initialSlug ?? null);
  // "saved" shows the published Convex row; "auto" is an unsaved SMILES preview;
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
  // Flipped on once Convex data has stayed unavailable past LOAD_TIMEOUT_MS.
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

  // --- live Convex data -----------------------------------------------------
  const { lookup } = useSubstanceLookup();
  const overrideList = useQuery(api.moleculeOverrides.listSlugs);
  const article = useQuery(
    api.substanceIndex.getBySlug,
    selected && mode === "substances" ? { slug: selected } : "skip",
  );
  // Only the loading/loaded transition may re-resolve the baseline. Depending on
  // `article` itself would re-run on every redelivery, since the live query hands
  // back a fresh object identity each time even when nothing changed.
  const articleLoading = article === undefined;
  // Mirrors `source` so the resolver can tell a genuine baseline change from a
  // re-run caused by a Convex query redelivering an equal value under a fresh
  // object identity (a resubscribe, or any write touching the same row).
  const sourceRef = useRef<string | null>(null);

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
      if (!options?.force && sourceRef.current === molblock) return;
      sourceRef.current = molblock;
      setSource(molblock);
      setEdited(molblock);
      // Bold bonds belong to the baseline: a new baseline installs its own set,
      // and the redelivery no-op above keeps unsaved toggles from being reset.
      const bold = options?.boldBonds ?? [];
      setBoldBonds(bold);
      setBoldBaseline(bold);
      setSourceEpoch((epoch) => epoch + 1);
    },
    [],
  );

  /** Accept the live edit as the new baseline after a successful save. */
  const markSourceSaved = useCallback((molblock: string) => {
    sourceRef.current = molblock;
    setSource(molblock);
  }, []);

  const templateMemberOverride = useQuery(
    api.moleculeOverrides.getBySlug,
    mode === "templates" && templateMemberSlug ? { slug: templateMemberSlug } : "skip",
  );
  const {
    results: classMembershipPages,
    status: classMembershipStatus,
    loadMore: loadMoreClassMembership,
  } = usePaginatedQuery(
    api.substanceIndex.getSearchInputPage,
    mode === "templates" ? {} : "skip",
    { initialNumItems: SEARCH_INPUT_PAGE_SIZE },
  );
  useEffect(() => {
    if (mode === "templates" && classMembershipStatus === "CanLoadMore") {
      loadMoreClassMembership(SEARCH_INPUT_PAGE_SIZE);
    }
  }, [classMembershipStatus, loadMoreClassMembership, mode]);
  const classMembershipInput =
    classMembershipStatus === "Exhausted" ? classMembershipPages : undefined;

  const overrideSet = useMemo(
    () => new Set((overrideList ?? []).map((row) => row.slug)),
    [overrideList],
  );
  const overrideCount = useMemo(
    () =>
      mode === "classes"
        ? Array.from(overrideSet).filter((slug) => slug.startsWith("class:")).length
        : Array.from(overrideSet).filter((slug) => !slug.startsWith("class:")).length,
    [mode, overrideSet],
  );
  const molecules = useMemo<MoleculePickerItem[] | null>(
    () => (lookup ? buildSubstancePickerItems(lookup, overrideSet) : null),
    [lookup, overrideSet],
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
  // and template modes also offer the saved class overrides (their Convex slugs
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
  const smiles = useMemo(
    () => (mode === "classes" ? selectedClass?.smiles ?? "" : extractSmiles(article)),
    [article, mode, selectedClass],
  );
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
  // and display labels are injected at draw time by atom index.
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
  const handleEditorChange = useCallback(
    (molblock: string) => {
      setEdited(
        mode === "classes" && source
          ? normalizeClassMolblock(molblock, source, classDummies)
          : molblock,
      );
    },
    [mode, source, classDummies],
  );

  // Use the protected editor route for selected depictions, matching the save
  // target and the class-template read path. Browser Convex reads still power
  // lightweight picker metadata, but the editable record must round-trip to the
  // same deployment that receives the save.
  useEffect(() => {
    const slug = selected ? (mode === "substances" ? selected : `class:${selected}`) : null;
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
  }, [mode, selected]);

  // Template reads use the same protected server route/Convex target as saves,
  // so reopening a class round-trips the row even when public and editor Convex
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
      return; // article still loading
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
          "Automatic layout only — expect to tidy the drawing before saving.",
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
      setPreviewSvg(renderMoleculeSvg(ocl, edited, classLabels, boldBonds));
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
  }, [ocl, rdkit, edited, smiles, mode, source, classLabels, boldBonds]);

  // If Convex never resolves, stop showing an indefinite "Loading…".
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

  const guardMismatch = guard != null && !guard.match;
  // `edited` only diverges from `source` on a real user edit (OclEditor filters
  // programmatic loads), so this is a reliable dirty flag.
  const dirty = hasUnsavedChanges;
  const renderBlocked = !!oclError || !!rdkitError || !!canvasError;
  const canSave =
    dirty && !!edited && !!previewSvg && !saving && !noStructure && !renderBlocked;
  // Gates all whole-depiction transforms: the two mirror flips and both alignment rotations.
  const canTransform = !!edited && !saving && !noStructure && !renderBlocked;

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
              ? `Rotated ${amount} — the bond is now vertical. Save to publish.`
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
    const svg = renderMoleculeSvg(ocl, edited, classLabels, boldBonds);
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
          message: "Saved — the class template is ready for later preview/apply work.",
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
      setSaveResult({
        tone: "success",
        message:
          mode === "classes"
            ? "Saved — the override is live. The class page refreshes momentarily."
            : "Saved — this is now the live depiction. The substance page refreshes momentarily.",
      });
    } catch (err) {
      setSaveResult({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [selected, edited, ocl, smiles, mode, classLabels, boldBonds]);

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
      setSaveResult({
        tone: "success",
        message: "Override removed — reverted to the automatic layout.",
      });
    } catch (err) {
      setSaveResult({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [selected, mode]);

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
      {/* ---- substance picker + overview --------------------------------- */}
      <EditorSection
        icon="lucide:hexagon"
        title="Molecule depiction editor"
        description="Edit saved molecule depictions, generic class structures, or private class orientation templates in one canvas. Template saves do not change public molecules."
        actions={<RendererStatus ready={!!ocl && !!rdkit} error={oclError ?? rdkitError} />}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <EditorSegmentedControl
            label="Molecule editor mode"
            value={mode}
            onChange={changeMode}
            options={[
              { value: "substances", label: "Substances", icon: "lucide:pill" },
              { value: "classes", label: "Generic classes", icon: "lucide:hexagon" },
              { value: "templates", label: "Class templates", icon: "lucide:layout-template" },
            ]}
          />
          <SubstanceCombobox
            label={mode === "substances" ? "Select a substance" : "Select a class"}
            molecules={pickerItems}
            selected={selected}
            onSelect={onSelect}
            loadTimedOut={loadTimedOut}
            mode={mode}
          />
          {pickerItems ? (
            <p className="theme-text-muted text-xs">
              {mode === "templates"
                ? `${loadedCount} classes`
                : mode === "classes"
                  ? `${loadedCount} classes · ${overrideCount} overrides`
                  : `${loadedCount} substances · ${overrideCount} saved depictions · ${publishedCount} published articles`}
            </p>
          ) : null}
          {selected && !noStructure ? (
            <span className="theme-text-faint ml-auto text-xs">
              <span className="theme-text-muted font-mono">{selected}</span>
              {" · "}
              {variant === "imported"
                ? "imported structure — unsaved"
                : loadedFromOverride
                  ? mode === "templates"
                    ? "saved template"
                    : mode === "classes"
                    ? "saved override"
                    : "saved depiction"
                  : mode === "templates"
                    ? "new template"
                    : "unsaved auto layout"}
            </span>
          ) : null}
        </div>

        {selected ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
              {mode === "substances" ? "Start from another substance" : "Start from a saved structure"}
            </span>
            <SubstanceCombobox
              label="Select a structure to import"
              molecules={importableMolecules}
              selected={importSlug}
              onSelect={setImportSlug}
              loadTimedOut={loadTimedOut}
              mode="substances"
              placeholder="Import a saved structure…"
              searchPlaceholder="Search saved depictions…"
            />
            <Button
              variant="outline"
              onClick={() => void importFromSubstance()}
              disabled={!importSlug || importing || saving}
              title="Replace the canvas with that saved drawing as a starting point"
            >
              <Icon
                icon={importing ? "lucide:loader-2" : "lucide:import"}
                size={15}
                className={importing ? "animate-spin" : undefined}
              />
              Load structure
            </Button>
            <span className="theme-text-faint text-xs">
              {mode === "substances"
                ? "Replaces the canvas — good for drawing an analogue of an existing molecule."
                : mode === "templates"
                  ? "Replaces the canvas; R-group placeholders are stripped so the template stays a plain scaffold."
                  : "Replaces the canvas — start the class drawing from any saved structure."}
            </span>
          </div>
        ) : null}

        {selected ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
              Start from pasted SMILES
            </span>
            <Input
              value={pasteSmilesInput}
              onChange={(event) => setPasteSmilesInput(event.target.value)}
              placeholder="Paste SMILES…"
              aria-label="SMILES to load into the canvas"
              disabled={importing || saving}
              className="w-full sm:w-[22rem]"
            />
            <Button
              variant="outline"
              onClick={() => void importFromSmiles()}
              disabled={!pasteSmilesInput.trim() || importing || saving}
              title="Replace the canvas with an automatic layout of this SMILES"
            >
              <Icon
                icon={importing ? "lucide:loader-2" : "lucide:sparkles"}
                size={15}
                className={importing ? "animate-spin" : undefined}
              />
              Load SMILES
            </Button>
            <span className="theme-text-faint text-xs">
              Automatic layout — a starting point to tidy, not a finished drawing.
            </span>
          </div>
        ) : null}

        {mode === "templates" && selected && templateLoadError ? (
          <EditorNotice
            className="mt-4"
            notice={{
              tone: "danger",
              title: "Couldn't load template",
              message: templateLoadError,
              live: true,
            }}
          />
        ) : null}

        {mode !== "templates" && selected && overrideLoadError ? (
          <EditorNotice
            className="mt-4"
            notice={{
              tone: "danger",
              title: "Couldn't load depiction",
              message: overrideLoadError,
              live: true,
            }}
          />
        ) : null}

        {mode === "templates" && selected && templateDoc === null && !source && !templateLoadError ? (
          <TemplateInitialization
            onUseClassStructure={() => void initializeTemplateFromClassStructure()}
            smiles={templateSmilesInput}
            onSmilesChange={setTemplateSmilesInput}
            onUseSmiles={() => void initializeTemplateFromSmiles()}
            members={templateMemberItems}
            selectedMember={templateMemberSlug}
            onSelectMember={setTemplateMemberSlug}
            onUseMember={() => void initializeTemplateFromMember()}
            memberReady={templateMemberReady}
            classStructureReady={!!selectedClass && overrideDoc !== undefined}
            busy={initializingTemplate}
          />
        ) : null}
      </EditorSection>

      {/* ---- editor canvas + preview / guard / save ---------------------- */}
      <EditorSection
        icon="lucide:pencil"
        title="Editor"
        delay={0.05}
        description={
          selected && !noStructure ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon icon="lucide:lasso-select" size={13} className="shrink-0" />
              Pick the lasso tool near the top of the toolbar to drag atoms — the default bond
              tool draws new bonds. Wedge / hash stereo tools live in the same toolbar.
            </span>
          ) : undefined
        }
      >
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

        {/* canvas + control strip: side by side at xl; stacked below that, with the
            strip sticky at the viewport bottom so preview / guard / Save stay in view */}
        <div className="space-y-4 xl:flex xl:items-start xl:gap-6 xl:space-y-0">
          {/* canvas well */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
              drag-and-drop here only duplicates the accessible "Trace an image…"
              file picker in the settings rail; the well itself stays non-interactive */}
          <div
            className="relative h-[60vh] min-h-[30rem] w-full overflow-hidden rounded-xl border border-dose-border bg-dose-body xl:min-w-0 xl:flex-1"
            onDragOver={(event) => {
              if (selected && !noStructure) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!selected || noStructure) return;
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) tracing.loadFile(file);
            }}
          >
            {!selected ? (
              <EmptyCanvas />
            ) : noStructure ? (
              <NoStructureCanvas mode={mode} />
            ) : (
              <>
                {/* inset so OpenChemLib's white canvas reads as matted artwork inside
                    the dark frame rather than an edge-to-edge white slab */}
                <OclEditor
                  source={source}
                  sourceEpoch={sourceEpoch}
                  onChange={handleEditorChange}
                  onError={setCanvasError}
                  fineRotation={fineRotation}
                  mirrorDirection={mirrorDirection}
                  onMirrorComplete={() => setMirrorDirection(null)}
                  snapRequest={snapRequest}
                  onSnapComplete={onSnapComplete}
                  onSelectedBondCountChange={setSelectedBondCount}
                  bondPickActive={bondPickActive}
                  onBondPickComplete={onBondPickComplete}
                  boldBonds={boldBonds}
                  boldToggleActive={boldToggleActive}
                  onBoldBondsChange={setBoldBonds}
                  onBoldToggleExit={() => setBoldToggleActive(false)}
                  className="absolute inset-3 overflow-hidden rounded-lg"
                />
                <TracingOverlay layer={tracing} className="absolute inset-3 rounded-lg" />
                {computing ? (
                  <div className="theme-text-faint absolute inset-0 grid place-items-center bg-dose-surface-muted/70 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <Icon icon="lucide:loader-2" size={15} className="animate-spin" />
                      Loading molecule…
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* control strip: preview · guard · actions — a sticky bottom toolbar card
              below xl, a free-floating side rail at xl */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-start gap-x-6 gap-y-4 rounded-xl border border-dose-border bg-dose-surface-muted p-4 xl:static xl:w-64 xl:shrink-0 xl:flex-col xl:items-stretch xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0">
            <PreviewBox
              svg={previewSvg}
              ready={!!ocl}
              hasSelection={!!selected}
              error={!!oclError}
            />
            <GuardRow
              guard={guard}
              hasReference={mode === "templates" ? !!source : !!smiles}
              active={!!selected && !noStructure}
              mode={mode}
            />
            <div className="min-w-52 space-y-2 xl:min-w-0">
              <p className="theme-text-faint text-xs font-medium uppercase tracking-wide">
                Editor settings
              </p>
              <EditorCheckbox
                checked={fineRotation}
                onChange={(event) => setFineRotation(event.target.checked)}
                disabled={!selected || noStructure || renderBlocked}
                label="Fine rotation"
                description="Allow small free-angle adjustments below the editor's coarse rotation threshold."
              />
            </div>
            <div className="min-w-52 xl:min-w-0">
              <TracingControls layer={tracing} disabled={!selected || noStructure} />
            </div>
            <div className="ml-auto flex flex-col items-stretch gap-2 sm:items-end xl:ml-0 xl:items-stretch">
              {/* fixed-height slot so the status pill appearing doesn't shift the buttons */}
              <div className="flex min-h-6 items-center sm:justify-end xl:justify-start">
                {selected && !noStructure && (saving || dirty) ? (
                  <EditorActionStatus status={saving ? "saving" : "dirty"} />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
                {mode !== "templates" ? (
                  <Button
                    variant="outline"
                    onClick={revertToAuto}
                    disabled={!selected || noStructure || saving}
                    title="Regenerate from SMILES in the canvas; the public page changes only after Save"
                  >
                    <Icon icon="lucide:rotate-ccw" size={15} />
                    Revert to auto
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => setMirrorDirection("left-right")}
                  disabled={!canTransform}
                  title="Reflect this depiction across its vertical centre line"
                >
                  <Icon icon="lucide:flip-horizontal-2" size={15} />
                  Flip left/right
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMirrorDirection("up-down")}
                  disabled={!canTransform}
                  title="Reflect this depiction across its horizontal centre line"
                >
                  <Icon icon="lucide:flip-vertical-2" size={15} />
                  Flip up/down
                </Button>
                <Button
                  variant={bondPickActive ? "accent" : "outline"}
                  aria-pressed={bondPickActive}
                  onClick={() => {
                    if (bondPickActive) {
                      setBondPickActive(false);
                      return;
                    }
                    // Power-user shortcut: a bond already lasso-selected applies
                    // immediately; everyone else clicks the bond on the canvas.
                    if (selectedBondCount === 1) {
                      setSnapRequest("bond-vertical");
                      return;
                    }
                    setBoldToggleActive(false);
                    setBondPickActive(true);
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
                  <Icon
                    icon={bondPickActive ? "lucide:x" : "lucide:align-center-vertical"}
                    size={15}
                  />
                  {bondPickActive ? "Cancel bond pick" : "Set bond vertical"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSnapRequest("straighten")}
                  disabled={!canTransform || snapRequest !== null}
                  title="Rotate the whole depiction the small amount needed to sit its bonds back on the standard 30° drawing grid"
                >
                  <Icon icon="lucide:ruler" size={15} />
                  Straighten
                </Button>
                <Button
                  variant={boldToggleActive ? "accent" : "outline"}
                  aria-pressed={boldToggleActive}
                  onClick={() => {
                    if (boldToggleActive) {
                      setBoldToggleActive(false);
                      return;
                    }
                    setBondPickActive(false);
                    setBoldToggleActive(true);
                  }}
                  disabled={!canTransform || snapRequest !== null}
                  title={
                    boldToggleActive
                      ? "Click bonds on the canvas to toggle bold; press Esc or this button to finish"
                      : mode === "templates"
                        ? "Then click bonds on the canvas to draw them thicker while editing; applies copy coordinates, never bold"
                        : "Then click bonds on the canvas to draw them thicker — on the canvas, the preview, and the article alike"
                  }
                >
                  <Icon icon={boldToggleActive ? "lucide:x" : "lucide:bold"} size={15} />
                  {boldToggleActive ? "Done with bold" : "Bold bonds"}
                </Button>
                {mode === "classes" ? (
                  <Button
                    variant="ghostDestructive"
                    onClick={requestRemove}
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
                    onClick={() => void templateApplication.prepare()}
                    disabled={dirty || saving || !rdkit || !ocl || templateApplication.preparing}
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
                <p className="theme-danger-text max-w-xs text-xs sm:text-right xl:text-left">
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
                    <Button variant="outline" size="sm" onClick={() => setSaveResult(null)}>
                      Dismiss
                    </Button>
                  ),
                }}
              />
            ) : null}
          </div>
        </div>
      </EditorSection>

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

// ---------------------------------------------------------------------------
function RendererStatus({ ready, error }: { ready: boolean; error: string | null }) {
  if (error) {
    return (
      <EditorStatusPill tone="danger" icon="lucide:circle-alert">
        renderer failed
      </EditorStatusPill>
    );
  }
  return ready ? (
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
  mode,
}: {
  guard: InchiComparison | null;
  hasReference: boolean;
  active: boolean;
  mode: EditorMode;
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
        {mode === "substances" ? "Stereo guard" : "Structure guard"}
      </span>
      <div>{pill}</div>
      {mismatch ? (
        <p className="theme-danger-text text-xs">
          {mode === "classes" || mode === "templates"
            ? "Warning: this changed the canonical class structure, not just the drawing."
            : "Warning: this changed the actual molecule, not just the drawing."}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared-kit confirmation dialog for destructive / discard actions. Rendering is
 * driven by a {@link ConfirmRequest}; closing (overlay click, Escape, Cancel, or a
 * completed confirm) clears the request via `onClose`.
 */
function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md" showClose={false}>
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription className="theme-text-muted">
                {request.description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant={request.destructive ? "destructive" : "accent"}
                onClick={() => {
                  request.onConfirm();
                  onClose();
                }}
              >
                {request.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateInitialization({
  onUseClassStructure,
  smiles,
  onSmilesChange,
  onUseSmiles,
  members,
  selectedMember,
  onSelectMember,
  onUseMember,
  memberReady,
  classStructureReady,
  busy,
}: {
  onUseClassStructure: () => void;
  smiles: string;
  onSmilesChange: (value: string) => void;
  onUseSmiles: () => void;
  members: MoleculePickerItem[];
  selectedMember: string | null;
  onSelectMember: (slug: string) => void;
  onUseMember: () => void;
  memberReady: boolean;
  classStructureReady: boolean;
  busy: boolean;
}) {
  return (
    <Surface
      variant="muted"
      padding="sm"
      radius="lg"
      className="mt-4 grid gap-4 lg:grid-cols-3"
    >
      <div className="space-y-2">
        <div>
          <p className="theme-text-primary text-sm font-medium">Start from the class structure</p>
          <p className="theme-text-muted text-xs">
            Load the familiar generic class depiction, without its R-group placeholders.
          </p>
        </div>
        <Button
          variant="accent"
          onClick={onUseClassStructure}
          disabled={busy || !classStructureReady}
        >
          <Icon icon={busy ? "lucide:loader-2" : "lucide:git-fork"} size={15} className={busy ? "animate-spin" : undefined} />
          Use class structure
        </Button>
      </div>
      <div className="space-y-2">
        <div>
          <p className="theme-text-primary text-sm font-medium">Start from SMILES</p>
          <p className="theme-text-muted text-xs">Paste a plain scaffold, then generate its editable layout.</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={smiles}
            onChange={(event) => onSmilesChange(event.target.value)}
            placeholder="Paste scaffold SMILES…"
            aria-label="Template scaffold SMILES"
            disabled={busy}
          />
          <Button variant="outline" onClick={onUseSmiles} disabled={busy || !smiles.trim()}>
            <Icon icon={busy ? "lucide:loader-2" : "lucide:sparkles"} size={15} className={busy ? "animate-spin" : undefined} />
            Use SMILES
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <p className="theme-text-primary text-sm font-medium">Start from a member</p>
          <p className="theme-text-muted text-xs">Load a class member&apos;s current depiction.</p>
        </div>
        {members.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <SubstanceCombobox
              label="Select a class member"
              molecules={members}
              selected={selectedMember}
              onSelect={onSelectMember}
              loadTimedOut={false}
              mode="substances"
              placeholder="Select a member…"
              searchPlaceholder="Search class members…"
            />
            <Button variant="outline" onClick={onUseMember} disabled={busy || !memberReady}>
              <Icon icon={busy ? "lucide:loader-2" : "lucide:copy"} size={15} className={busy ? "animate-spin" : undefined} />
              Load member
            </Button>
          </div>
        ) : (
          <p className="theme-text-faint text-sm">
            No class members with stored MOL blocks are available.
          </p>
        )}
      </div>
    </Surface>
  );
}

function PreviewBox({
  svg,
  ready,
  hasSelection,
  error,
}: {
  svg: string | null;
  ready: boolean;
  hasSelection: boolean;
  error: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">
        Brand preview
      </span>
      <div className="grid h-28 w-28 place-items-center rounded-xl border border-dose-border bg-dose-surface-muted p-2">
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
            {!hasSelection ? "Pick a molecule" : !ready ? "Loading…" : "Rendering…"}
          </span>
        )}
      </div>
    </div>
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
          Pick a substance or class from the dropdown above to load its structure, then fix its atom
          positions and wedge / hash stereo bonds.
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

/** Searchable substance dropdown (Popover + Command) replacing the old list column. */
function SubstanceCombobox({
  label: ariaLabel,
  molecules,
  selected,
  onSelect,
  loadTimedOut,
  mode,
  placeholder,
  searchPlaceholder,
}: {
  label: string;
  molecules: MoleculePickerItem[] | null;
  selected: string | null;
  onSelect: (slug: string) => void;
  loadTimedOut: boolean;
  mode: EditorMode;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = molecules?.find((m) => m.slug === selected) ?? null;
  const groups = useMemo(() => groupMoleculePickerItems(molecules ?? []), [molecules]);
  const label = !molecules
    ? loadTimedOut
      ? `${mode === "classes" ? "Classes" : "Substances"} unavailable`
      : `Loading ${mode}…`
    : current
      ? current.title
      : placeholder
        ? placeholder
        : mode === "classes" || mode === "templates"
        ? "Select a class…"
        : "Select a substance…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={!molecules}
          className="w-full justify-between sm:w-[22rem]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon
              icon={mode === "substances" ? "lucide:pill" : "lucide:hexagon"}
              size={15}
              className="theme-text-faint shrink-0"
            />
            <span className={cn("truncate", !current && "theme-text-muted")}>{label}</span>
            {current?.hasOverride ? (
              <EditorStatusPill
                tone="info"
                icon="lucide:pencil"
                className="shrink-0"
                title={SAVED_PILL_TITLE}
              >
                {mode === "classes" ? "override" : "saved"}
              </EditorStatusPill>
            ) : null}
            {current?.publiclyListed ? (
              <EditorStatusPill
                tone="success"
                icon="lucide:globe"
                className="shrink-0"
                title={PUBLISHED_PILL_TITLE}
              >
                published
              </EditorStatusPill>
            ) : null}
          </span>
          <Icon
            icon="lucide:chevrons-up-down"
            size={15}
            className="theme-text-faint ml-2 shrink-0"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={
              searchPlaceholder ??
              (mode === "classes" || mode === "templates"
                ? "Search by label or key…"
                : "Search by name or slug…")
            }
          />
          <CommandList>
            <CommandEmpty>No molecules found</CommandEmpty>
            {/* One group per visibility tier + category; cmdk hides a heading whose
                items are all filtered out, so search still reads as one list. */}
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={group.heading}>
                {group.items.map((m) => (
                  <CommandItem
                    key={m.slug}
                    value={`${m.title} ${m.slug}`}
                    onSelect={() => {
                      onSelect(m.slug);
                      setOpen(false);
                    }}
                  >
                    <Icon
                      icon="lucide:check"
                      size={15}
                      className={cn(
                        "mr-2 shrink-0",
                        selected === m.slug ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate font-medium">{m.title}</span>
                    <span className="theme-text-faint ml-2 shrink-0 text-xs">{m.slug}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {m.hasOverride ? (
                        <EditorStatusPill tone="info" title={SAVED_PILL_TITLE}>
                          {mode === "classes" ? "override" : "saved"}
                        </EditorStatusPill>
                      ) : null}
                      {m.publiclyListed ? (
                        <EditorStatusPill tone="success" title={PUBLISHED_PILL_TITLE}>
                          published
                        </EditorStatusPill>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
