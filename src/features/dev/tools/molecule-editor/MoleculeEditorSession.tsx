"use client";

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
import {
  DEPICTION_LOADING,
  depictionLoaded,
  knownDepiction,
  readMoleculeOverride,
  readMoleculeTemplate,
  settleDepictionRead,
  type DepictionRead,
} from "./moleculeEditorRequests";
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
  listRecord: MoleculePaneRecord | null;
  listLoading: boolean;
  onClose: () => void;
  onBackToList: () => void;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
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
  const [variant, setVariant] = useState<"saved" | "auto" | "imported">("saved");
  const [importedMolblock, setImportedMolblock] = useState<string | null>(null);
  const [importSlug, setImportSlug] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pasteSmilesInput, setPasteSmilesInput] = useState("");

  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [emissionLabels, setEmissionLabels] = useState<Record<number, string> | null>(null);
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [mirrorDirection, setMirrorDirection] = useState<MoleculeMirrorDirection | null>(null);
  const [snapRequest, setSnapRequest] = useState<MoleculeSnapKind | null>(null);
  const [selectedBondCount, setSelectedBondCount] = useState(0);
  const [bondPickActive, setBondPickActive] = useState(false);
  const [boldBonds, setBoldBonds] = useState<number[]>([]);
  const [boldBaseline, setBoldBaseline] = useState<number[]>([]);
  const [boldToggleActive, setBoldToggleActive] = useState(false);
  const [computing, setComputing] = useState(false);
  const [noStructure, setNoStructure] = useState(false);

  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [guard, setGuard] = useState<InchiComparison | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const { confirm: requestConfirm, dialog: confirmDialog } = useConfirm();
  const [templateRead, setTemplateRead] = useState<DepictionRead<MoleculeClassTemplate>>(DEPICTION_LOADING);
  const [templateReload, setTemplateReload] = useState(0);
  const [templateSmilesInput, setTemplateSmilesInput] = useState("");
  const [templateMemberSlug, setTemplateMemberSlug] = useState<string | null>(null);
  const [initializingTemplate, setInitializingTemplate] = useState(false);
  const [overrideRead, setOverrideRead] = useState<DepictionRead<MoleculeOverride>>(DEPICTION_LOADING);
  const [overrideReload, setOverrideReload] = useState(0);
  const templateDoc = knownDepiction(templateRead);
  const overrideDoc = knownDepiction(overrideRead);
  const snapshotStatus = (mode === "templates" ? templateRead : overrideRead).status;
  const forceNextLoad = useRef(false);
  const freeze = useWriteFreeze();
  const saveKeyLabel = useModifierKeyLabel("S");
  const tracing = useTracingLayer();
  const invalidateEditorReads = useInvalidateEditorReads();
  const moleculeSourceRead = useMoleculeSourceReadState(
    selected && mode === "substances" ? selected : null,
  );
  const moleculeSource = moleculeSourceRead.data;
  const articleLoading = moleculeSource === undefined && !moleculeSourceRead.error;
  const sourceRef = useRef<string | null>(null);

  const normalizeForComparison = useCallback(
    (molblock: string): string => {
      if (!ocl) return molblock;
      try {
        const roundTripped = stripOclCustomLabelSgroups(
          ocl.Molecule.fromMolfile(molblock).toMolfile(),
        );
        return normalizeClassMolblock(roundTripped, molblock, parseClassDummies(molblock));
      } catch {
        return molblock;
      }
    },
    [ocl],
  );

  const loadSource = useCallback(
    (molblock: string | null, options?: { force?: boolean; boldBonds?: number[] }) => {
      const normalized = molblock === null ? null : normalizeForComparison(molblock);
      if (!options?.force && sourceRef.current === normalized) return;
      sourceRef.current = normalized;
      setSource(normalized);
      setEdited(normalized);
      setEmissionLabels(null);
      const bold = options?.boldBonds ?? [];
      setBoldBonds(bold);
      setBoldBaseline(bold);
      setSourceEpoch((epoch) => epoch + 1);
    },
    [normalizeForComparison],
  );

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
  const boldDirty =
    boldBonds.length !== boldBaseline.length ||
    boldBonds.some((bond, index) => bond !== boldBaseline[index]);
  const hasUnsavedChanges =
    edited !== source || boldDirty || (mode === "templates" && !!edited && !templateDoc);

  const generateClassMolblock = useCallback(
    (item: ClassStructureItem): string | null => {
      if (!rdkit) return null;
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
  const previewAtomLabels = emissionLabels ?? classLabels;
  const handleEditorChange = useCallback(
    (molblock: string, displayedAtomLabels?: Record<number, string>) => {
      if (mode !== "classes" || !source) {
        setEmissionLabels(displayedAtomLabels ?? null);
        setEdited(molblock);
        return;
      }
      const rLabels = selectedClass?.rLabels ?? {};
      const { molblock: convertedMolblock, converted } = convertTypedRGroups(
        normalizeClassMolblock(molblock, source, classDummies),
        Object.keys(rLabels),
      );
      const convertedEntries = Object.entries(converted);
      if (displayedAtomLabels || convertedEntries.length > 0) {
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

  useEffect(() => {
    const slug =
      selected && mode === "substances"
        ? selected
        : selected && mode === "classes"
          ? `class:${selected}`
          : selected && mode === "templates" && templateDoc === null
            ? `class:${selected}`
            : null;
    setOverrideRead(DEPICTION_LOADING);
    if (!slug) return;
    let cancelled = false;
    void settleDepictionRead(readMoleculeOverride(slug)).then((next) => {
      if (!cancelled) setOverrideRead(next);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, selected, templateDoc, overrideReload]);

  useEffect(() => {
    setTemplateRead(DEPICTION_LOADING);
    if (mode !== "templates" || !selected) return;
    let cancelled = false;
    void settleDepictionRead(readMoleculeTemplate(selected)).then((next) => {
      if (!cancelled) setTemplateRead(next);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, selected, templateReload]);

  useEffect(() => {
    if (!selected) {
      loadSource(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (!ocl) {
      setComputing(true);
      return;
    }
    if (snapshotStatus === "failed") {
      loadSource(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
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
      return;
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
      return;
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
    snapshotStatus,
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
    if (mode !== "templates" || !selectedClass || overrideDoc === undefined) return;
    setInitializingTemplate(true);
    setSaveResult(null);

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

  const importFromSubstance = useCallback(async () => {
    if (!selected || !importSlug) return;
    const run = async () => {
      setImporting(true);
      setSaveResult(null);
      try {
        let molblock: string | undefined;
        if (importSlug.startsWith("template:")) {
          molblock = (await readMoleculeTemplate(importSlug.slice("template:".length)))?.molblock;
        } else {
          molblock = (await readMoleculeOverride(importSlug))?.molblock;
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

  useEffect(() => {
    if (saveResult?.tone !== "success") return;
    const id = setTimeout(() => setSaveResult(null), 6000);
    return () => clearTimeout(id);
  }, [saveResult]);

  const dirty = hasUnsavedChanges;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const renderBlocked = !!oclError || !!rdkitError || !!canvasError;
  const enginesReady = !!ocl && !!rdkit;
  const publishName =
    mode === "substances"
      ? molecules?.find((item) => item.slug === selected)?.title ?? selected
      : mode === "classes"
        ? selectedClass?.label ?? selected
        : null;
  useUnsavedWork({
    kind: "discard-only",
    because: mode === "templates" ? "Review the chemistry checks and save this template from the tool." : "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: "molecule-editor",
    label: `Molecules: ${publishName ?? selected ?? "open depiction"}`,
    dirty,
    discard: () => {
      if (!saving) loadSource(source, { force: true, boldBonds: boldBaseline });
    },
  });
  const chemistryChanged = guard != null && !guard.match;
  const chemistryConfirmed =
    !chemistryChanged || !publishName || matchesTypedName(confirmName, publishName);
  const snapshotLoaded = snapshotStatus === "loaded";
  const canSave =
    snapshotLoaded &&
    enginesReady &&
    dirty &&
    !!edited &&
    !!previewSvg &&
    !saving &&
    !noStructure &&
    !renderBlocked &&
    chemistryConfirmed;
  const canTransform =
    snapshotLoaded && enginesReady && !!edited && !saving && !noStructure && !renderBlocked;

  useEffect(() => {
    if (!canTransform) {
      setBondPickActive(false);
      setBoldToggleActive(false);
    }
  }, [canTransform]);

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

  const save = useCallback(async () => {
    if (!selected || !edited || !ocl || !snapshotLoaded) return;
    setSaving(true);
    setSaveResult(null);
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
        setTemplateRead(depictionLoaded(savedTemplate));
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
      setOverrideRead(
        depictionLoaded({
          slug: saveSlug,
          molblock: edited,
          svg,
          ...(smiles ? { smiles } : {}),
          ...(boldBonds.length > 0 ? { boldBonds } : {}),
          source: "editor",
          updatedAt: body.updatedAt ?? new Date().toISOString(),
          ...(body.updatedBy ? { updatedBy: body.updatedBy } : {}),
        }),
      );
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
    snapshotLoaded,
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
      setOverrideRead(depictionLoaded(null));
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

  const requestRemove = useCallback(() => {
    if (!selected || !hasOverride) return;
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
  }, [selected, hasOverride, dirty, performRemove, requestConfirm, publishName]);

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
              templateRead={templateRead}
              overrideRead={overrideRead}
              onRetryOverride={() => setOverrideReload((key) => key + 1)}
              onRetryTemplate={() => setTemplateReload((key) => key + 1)}
              sourceError={moleculeSourceRead.error}
              onRetrySource={moleculeSourceRead.retry}
              membersError={classMembershipRead.error}
              onRetryMembers={classMembershipRead.retry}
            />
            {mode === "templates" && templateDoc === null && !source ? (
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
          snapshotStatus === "failed" || (mode === "templates" && templateDoc === null && !source) ? null : <MoleculeStartingPoints
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
        snapshotFailed={snapshotStatus === "failed"}
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

function frozenResult(verb: "published" | "saved" | "removed"): SaveResult {
  return {
    tone: "danger",
    kind: "frozen",
    title: verb === "removed" ? "Not removed" : verb === "saved" ? "Not saved" : "Not published",
    message: `Writes are paused, so your changes were not ${verb}. Your edit is still on the canvas.`,
  };
}
