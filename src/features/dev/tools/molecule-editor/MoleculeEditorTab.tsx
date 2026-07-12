"use client";

/**
 * Molecule depiction editor (`/dev` → Molecules).
 *
 * Fix the wedge/hash stereo bonds and atom positions of a molecule's skeletal diagram
 * when the automatic RDKit layout draws them badly.
 *   • picker — searchable substance combobox (a pill marks molecules that already
 *     have a published Convex depiction)
 *   • canvas — OpenChemLib editor: reposition atoms (lasso tool), set per-bond
 *     wedge/hash stereo
 *   • control strip — live brand-styled RDKit.js preview + stereo guard + Save /
 *     Revert; a side rail at xl widths, a sticky bottom toolbar below that
 *
 * Data is live Convex, so this works on the deployed admin host (not just locally):
 *   • the picker + per-substance SMILES come from the `substanceIndex` queries
 *   • the starting structure is the published `moleculeOverrides` MOL block (including
 *     seeded auto-layout baselines); Revert to auto regenerates a local SMILES layout
 *   • Save POSTs to the editor-gated `/api/dev/molecule-override` route, which writes
 *     Convex + revalidates the public substance page
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
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
  EditorSegmentedControl,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";
import type { InchiComparison } from "./stereoGuard";
import { compareCanonicalSmiles, compareInchi } from "./stereoGuard";
import { renderMoleculeSvg } from "./renderMoleculeSvg";
import { smilesToMolblock } from "./smilesToMolblock";
import { OclEditor } from "./OclEditor";
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
import { TemplateApplyDialog } from "./TemplateApplyDialog";
import { useTemplateApplication } from "./useTemplateApplication";

interface MoleculeListItem {
  slug: string;
  title: string;
  hasOverride: boolean;
}

type EditorMode = "substances" | "classes" | "templates";

interface MoleculeClassTemplate {
  classKey: string;
  molblock: string;
  updatedAt: number;
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

/** The success / error outcome of the last Save or Remove call. */
interface SaveResult {
  tone: "success" | "danger";
  message: string;
}

const SAVE_API = "/api/dev/molecule-override";
const TEMPLATE_API = "/api/dev/molecule-class-template";

/** If Convex data has not arrived after this long, stop promising "Loading…". */
const LOAD_TIMEOUT_MS = 8000;

/** Pull the article's SMILES from whichever shape the Convex doc carries. */
function extractSmiles(article: unknown): string {
  const a = article as { identification?: { smiles?: unknown } } | null | undefined;
  const smiles = a?.identification?.smiles;
  return typeof smiles === "string" ? smiles.trim() : "";
}

export function MoleculeEditorTab() {
  const { rdkit, error: rdkitError } = useRdkit();

  const [mode, setMode] = useState<EditorMode>("substances");
  const [selected, setSelected] = useState<string | null>(null);
  // "saved" shows the published Convex row; "auto" is an unsaved SMILES preview.
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

  // --- live Convex data -----------------------------------------------------
  const lookup = useQuery(api.substanceIndex.getLookup);
  const overrideList = useQuery(api.moleculeOverrides.listSlugs);
  const overrideDoc = useQuery(
    api.moleculeOverrides.getBySlug,
    selected && mode !== "templates"
      ? { slug: mode === "classes" ? `class:${selected}` : selected }
      : "skip",
  );
  const article = useQuery(
    api.substanceIndex.getBySlug,
    selected && mode === "substances" ? { slug: selected } : "skip",
  );
  const templateMemberOverride = useQuery(
    api.moleculeOverrides.getBySlug,
    mode === "templates" && templateMemberSlug ? { slug: templateMemberSlug } : "skip",
  );
  const classMembershipInput = useQuery(
    api.substanceIndex.getSearchInput,
    mode === "templates" ? {} : "skip",
  );

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
  const classStructures = useMemo<MoleculeListItem[]>(
    () =>
      CLASS_STRUCTURES.map((item) => ({
        slug: item.key,
        title: item.label,
        hasOverride: overrideSet.has(`class:${item.key}`),
      })).sort((a, b) => a.title.localeCompare(b.title)),
    [overrideSet],
  );
  const classTemplates = useMemo<MoleculeListItem[]>(
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
  const templateMemberItems = useMemo<MoleculeListItem[]>(
    () =>
      selected
        ? buildClassTemplateMemberOptions(selected, classMembershipInput ?? [], overrideSet).map(
            (member) => ({ ...member, hasOverride: true }),
          )
        : [],
    [classMembershipInput, overrideSet, selected],
  );
  const templateApplyMemberItems = useMemo<MoleculeListItem[]>(
    () =>
      selected
        ? buildClassTemplateMemberOptions(selected, classMembershipInput ?? []).map((member) => ({
            ...member,
            hasOverride: overrideSet.has(member.slug),
          }))
        : [],
    [classMembershipInput, overrideSet, selected],
  );
  const templateApplication = useTemplateApplication({
    enabled: mode === "templates",
    classKey: selected,
    templateMolblock: templateDoc?.molblock,
    members: templateApplyMemberItems,
    rdkit,
  });
  const templateMemberReady = !!templateMemberSlug && !!templateMemberOverride;
  const hasUnsavedChanges =
    edited !== source || (mode === "templates" && !!edited && !templateDoc);

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
      setSource(null);
      setEdited(null);
      setNoStructure(false);
      setComputing(false);
      return;
    }
    if (mode === "templates") {
      if (templateDoc === undefined) {
        setSource(null);
        setEdited(null);
        setNoStructure(false);
        setComputing(true);
        return;
      }
      if (templateDoc) {
        setSource(templateDoc.molblock);
        setEdited(templateDoc.molblock);
        setNoStructure(false);
      } else {
        setSource(null);
        setEdited(null);
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
      setSource(overrideDoc.molblock);
      setEdited(overrideDoc.molblock);
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
        setSource(null);
        setEdited(null);
        setNoStructure(true);
        setComputing(false);
        return;
      }
      const molblock = generateClassMolblock(selectedClass);
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
  }, [
    selected,
    variant,
    overrideDoc,
    article,
    smiles,
    mode,
    rdkit,
    selectedClass,
    generateClassMolblock,
    templateDoc,
  ]);

  const onSelect = useCallback(
    (slug: string) => {
      if (slug === selected) return;
      const run = () => {
        setSelected(slug);
        setVariant("saved");
        setSaveResult(null);
        setCanvasError(null);
        setTemplateSmilesInput("");
        setTemplateMemberSlug(null);
        if (mode === "templates") {
          setTemplateDoc(undefined);
          setSource(null);
          setEdited(null);
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
    [selected, hasUnsavedChanges, mode],
  );

  const changeMode = useCallback(
    (nextMode: string) => {
      if (nextMode !== "substances" && nextMode !== "classes" && nextMode !== "templates") return;
      if (nextMode === mode) return;
      const run = () => {
        setMode(nextMode);
        setSelected(null);
        setVariant("saved");
        setSource(null);
        setEdited(null);
        setSaveResult(null);
        setCanvasError(null);
        setNoStructure(false);
        setTemplateDoc(undefined);
        setTemplateLoadError(null);
        setTemplateSmilesInput("");
        setTemplateMemberSlug(null);
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
    [hasUnsavedChanges, mode],
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
    setSource(molblock);
    setEdited(molblock);
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
    setSource(molblock);
    setEdited(molblock);
    setNoStructure(false);
    setInitializingTemplate(false);
  }, [mode, templateMemberOverride, templateMemberSlug]);

  // --- recompute preview + stereo guard on every edit (debounced) -----------
  useEffect(() => {
    if (!rdkit || !edited) {
      setPreviewSvg(null);
      setGuard(null);
      return;
    }
    const id = setTimeout(() => {
      setPreviewSvg(renderMoleculeSvg(rdkit, edited, classLabels));
      setGuard(
        mode === "classes" || mode === "templates"
          ? source
            ? compareCanonicalSmiles(rdkit, source, edited)
            : null
          : smiles
            ? compareInchi(rdkit, smiles, edited)
            : null,
      );
    }, 120);
    return () => clearTimeout(id);
  }, [rdkit, edited, smiles, mode, source, classLabels]);

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
  const renderBlocked = !!rdkitError || !!canvasError;
  const canSave =
    dirty && !!edited && !!previewSvg && !saving && !noStructure && !renderBlocked;

  // --- save / local auto preview / class-override removal ------------------
  const save = useCallback(async () => {
    if (!selected || !edited || !rdkit) return;
    setSaving(true);
    setSaveResult(null);
    // Render the published SVG from `edited` right now — the debounced preview can
    // lag the newest edit, and the posted SVG is what the public article serves.
    const svg = renderMoleculeSvg(rdkit, edited, classLabels);
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
          body: JSON.stringify({ classKey: selected, molblock: edited }),
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
          updatedAt: body.updatedAt ?? Date.now(),
          updatedBy: body.updatedBy,
        };
        setTemplateDoc(savedTemplate);
        setSource(edited);
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
        body: JSON.stringify({ slug: saveSlug, molblock: edited, svg, smiles }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setVariant("saved");
      setSaveResult({
        tone: "success",
        message:
          mode === "classes"
            ? "Saved — the override is live. The class page refreshes momentarily."
            : "Saved — this is now the published depiction. The substance page refreshes momentarily.",
      });
    } catch (err) {
      setSaveResult({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }, [selected, edited, rdkit, smiles, mode, classLabels]);

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
        description="Edit published molecule depictions, generic class structures, or private class orientation templates in one canvas. Template saves do not change public molecules."
        actions={<RdkitStatus rdkit={!!rdkit} error={rdkitError} />}
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
                : `${loadedCount} ${mode} · ${overrideCount} ${mode === "classes" ? "overrides" : "published"}`}
            </p>
          ) : null}
          {selected && !noStructure ? (
            <span className="theme-text-faint ml-auto text-xs">
              <span className="theme-text-muted font-mono">{selected}</span>
              {" · "}
              {loadedFromOverride
                ? mode === "templates"
                  ? "saved template"
                  : mode === "classes"
                  ? "saved override"
                  : "published depiction"
                : mode === "templates"
                  ? "new template"
                  : "unsaved auto layout"}
            </span>
          ) : null}
        </div>

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

        {mode === "templates" && selected && templateDoc === null && !source && !templateLoadError ? (
          <TemplateInitialization
            smiles={templateSmilesInput}
            onSmilesChange={setTemplateSmilesInput}
            onUseSmiles={() => void initializeTemplateFromSmiles()}
            members={templateMemberItems}
            selectedMember={templateMemberSlug}
            onSelectMember={setTemplateMemberSlug}
            onUseMember={() => void initializeTemplateFromMember()}
            memberReady={templateMemberReady}
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

        {/* canvas + control strip: side by side at xl; stacked below that, with the
            strip sticky at the viewport bottom so preview / guard / Save stay in view */}
        <div className="space-y-4 xl:flex xl:items-start xl:gap-6 xl:space-y-0">
          {/* canvas well */}
          <div className="relative h-[60vh] min-h-[30rem] w-full overflow-hidden rounded-xl border border-dose-border bg-dose-body xl:min-w-0 xl:flex-1">
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
                  onChange={handleEditorChange}
                  onError={setCanvasError}
                  className="absolute inset-3 overflow-hidden rounded-lg"
                />
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
              ready={!!rdkit}
              hasSelection={!!selected}
              error={!!rdkitError}
            />
            <GuardRow
              guard={guard}
              hasReference={mode === "templates" ? !!source : !!smiles}
              active={!!selected && !noStructure}
              mode={mode}
            />
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
                    disabled={dirty || saving || !rdkit || templateApplication.preparing}
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
  smiles,
  onSmilesChange,
  onUseSmiles,
  members,
  selectedMember,
  onSelectMember,
  onUseMember,
  memberReady,
  busy,
}: {
  smiles: string;
  onSmilesChange: (value: string) => void;
  onUseSmiles: () => void;
  members: MoleculeListItem[];
  selectedMember: string | null;
  onSelectMember: (slug: string) => void;
  onUseMember: () => void;
  memberReady: boolean;
  busy: boolean;
}) {
  return (
    <Surface
      variant="muted"
      padding="sm"
      radius="lg"
      className="mt-4 grid gap-4 lg:grid-cols-2"
    >
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
            // RDKit.js output rendered from our own MOL block (editor preview).
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
  molecules: MoleculeListItem[] | null;
  selected: string | null;
  onSelect: (slug: string) => void;
  loadTimedOut: boolean;
  mode: EditorMode;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = molecules?.find((m) => m.slug === selected) ?? null;
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
              <EditorStatusPill tone="info" icon="lucide:pencil">
                {mode === "classes" ? "override" : mode === "templates" ? "saved" : "published"}
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
            <CommandGroup>
              {(molecules ?? []).map((m) => (
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
                  {m.hasOverride ? (
                    <EditorStatusPill tone="info" className="ml-auto">
                      {mode === "classes" ? "override" : mode === "templates" ? "saved" : "published"}
                    </EditorStatusPill>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
