"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicSegmentedTabs, type PublicSegmentedTabItem } from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  EditorNotice,
  EditorSegmentedControl,
  EditorStatusPill,
  EditorToolbar,
  useConfirm,
  useDirtyGuard,
} from "@/features/dev/components";
import { useDevMode } from "../../context/DevModeContext";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { buildBoard, listDestinations } from "./boardModel";
import { IndexLayoutBoard } from "./IndexLayoutBoard";
import type { BoardActions } from "./IndexLayoutCard";
import { IndexLayoutJsonEditor } from "./IndexLayoutJsonEditor";
import { createLayoutDataHelpers } from "./layoutDataUtils";
import {
  addCategory,
  addSection,
  addSlug,
  bumpSlug,
  collectPlacedSlugs,
  moveSlug,
  placeSection,
  removeCategory,
  removeSection,
  removeSlug,
  renameSection,
  sortSlot,
  updateCategoryIdentity,
  type LayoutSlot,
} from "./layoutOps";
import { useLayoutConfirms } from "./useLayoutConfirms";
import { useLayoutEditor } from "./useLayoutEditor";
import { type IndexLayoutTabProps, type ManualDatasetKey, type ManualIndexConfig, type SubstanceOption } from "./types";
import { areManualsEqual, deepClone } from "./utils";

const DATASET_ORDER: ManualDatasetKey[] = ["psychoactive", "chemical", "mechanism"];

const SUBSTANCE_INDEX_ICON: IconName = "streamline-ultimate:science-molecule-strucutre-bold";

function NewCategoryPopover({ onAdd }: { onAdd: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLabel("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Icon icon="lucide:plus" size={14} />
          New category
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!label.trim()) return;
            onAdd(label);
            setOpen(false);
          }}
        >
          <label className="theme-text-faint block text-[11px] uppercase tracking-[0.18em]" htmlFor="new-category-label">
            Category name
          </label>
          <Input id="new-category-label" value={label} onChange={(event) => setLabel(event.target.value)} inputSize="sm" placeholder="Anxiolytic" />
          <p className="theme-text-faint text-xs">The icon follows the name; change it from the card afterwards.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!label.trim()}>
              Add category
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The public Substance Index, editable in place. Every category panel, section
 * and row is drawn by the same primitives the page uses; the only additions are
 * the handles. Edits stay in the draft until applied, then commit to
 * production through the shell's commit panel.
 */
export function IndexLayoutTab({ commitPanel, enableStickyPanels }: IndexLayoutTabProps) {
  const {
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    replacePsychoactiveIndexManual,
    replaceChemicalIndexManual,
    replaceMechanismIndexManual,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
  } = useDevMode();
  const { allSubstanceRecords, allSubstancesBySlug } = useLibrary();

  const { sortSlugsForDataset } = useMemo(
    () => createLayoutDataHelpers(allSubstanceRecords, allSubstancesBySlug),
    [allSubstanceRecords, allSubstancesBySlug],
  );

  const datasetDefinitions = useMemo(
    () => ({
      psychoactive: {
        key: "psychoactive" as const,
        label: "Psychoactive class",
        icon: "fluent:brain-circuit-28-filled" satisfies IconName,
        manual: psychoactiveIndexManual,
        replaceManual: replacePsychoactiveIndexManual,
        getOriginalManual: getOriginalPsychoactiveIndexManual,
      },
      chemical: {
        key: "chemical" as const,
        label: "Chemical class",
        icon: "solar:benzene-ring-linear" satisfies IconName,
        manual: chemicalIndexManual,
        replaceManual: replaceChemicalIndexManual,
        getOriginalManual: getOriginalChemicalIndexManual,
      },
      mechanism: {
        key: "mechanism" as const,
        label: "Mechanism of action",
        icon: "fa-solid:cogs" satisfies IconName,
        manual: mechanismIndexManual,
        replaceManual: replaceMechanismIndexManual,
        getOriginalManual: getOriginalMechanismIndexManual,
      },
    }),
    [
      chemicalIndexManual,
      getOriginalChemicalIndexManual,
      getOriginalMechanismIndexManual,
      getOriginalPsychoactiveIndexManual,
      mechanismIndexManual,
      psychoactiveIndexManual,
      replaceChemicalIndexManual,
      replaceMechanismIndexManual,
      replacePsychoactiveIndexManual,
    ],
  );

  const [activeDataset, setActiveDataset] = useState<ManualDatasetKey>("psychoactive");
  const [view, setView] = useState("all");
  const [showJson, setShowJson] = useState(false);

  const {
    state,
    setRawJsonForDataset,
    clearJsonErrorForDataset,
    setJsonErrorForDataset,
    updateDraftManualForDataset,
    applyJsonForDataset,
    saveDataset,
    resetDraft,
    resetToOriginal,
    setSaveNotice,
  } = useLayoutEditor({
    datasetOrder: DATASET_ORDER,
    datasetDefinitions,
    deepClone,
    areManualsEqual,
  });

  const activeDefinition = datasetDefinitions[activeDataset];
  const draftManual = state.draftManuals[activeDataset];
  const normalizedCurrentManual = state.normalizedCurrentManuals[activeDataset];
  const rawJsonDraft = state.rawJsonDrafts[activeDataset];
  const jsonError = state.jsonErrors[activeDataset];
  const saveNotice = state.saveNotice;

  // Only dataset switches clear the notice; setSaveNotice changes identity on every publish.
  useEffect(() => {
    setSaveNotice(null);
    setView("all");
  }, [activeDataset]);

  const hasUnsavedChanges = useMemo(
    () => !areManualsEqual(normalizedCurrentManual, draftManual),
    [draftManual, normalizedCurrentManual],
  );
  const { guard, dialog: dirtyDialog } = useDirtyGuard(hasUnsavedChanges, {
    title: `Leave the ${activeDefinition.label} draft?`,
    description: "Edits you have not applied to the draft are lost when you switch datasets.",
  });

  const update = useCallback(
    (updater: (manual: ManualIndexConfig) => ManualIndexConfig) => {
      updateDraftManualForDataset(activeDataset, updater);
    },
    [activeDataset, updateDraftManualForDataset],
  );

  const board = useMemo(() => buildBoard(draftManual, allSubstancesBySlug), [allSubstancesBySlug, draftManual]);
  const destinations = useMemo(() => listDestinations(board), [board]);

  const substanceOptions = useMemo<SubstanceOption[]>(
    () =>
      allSubstanceRecords
        .map((record) => ({ slug: record.slug, name: record.name, alias: record.aliases?.[0], isHidden: record.isHidden }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSubstanceRecords],
  );
  const addOptions = useMemo(() => {
    const placed = collectPlacedSlugs(draftManual);
    return substanceOptions
      .filter((option) => !placed.has(option.slug))
      .map((option) => ({ value: option.slug, label: option.name, hint: option.alias }));
  }, [draftManual, substanceOptions]);

  const { confirm, dialog: confirmDialog } = useConfirm();
  const { requestRemoveCategory, requestRemoveSection, requestResetDraft, requestRestoreSource } = useLayoutConfirms({
    confirm,
    datasetLabel: activeDefinition.label,
    categories: draftManual.categories,
    substanceOptions,
    removeCategory: (categoryKey) => {
      update((manual) => removeCategory(manual, categoryKey));
      if (view === categoryKey) setView("all");
    },
    removeSection: (categoryKey, sectionKey, keepDrugs) =>
      update((manual) => removeSection(manual, categoryKey, sectionKey, keepDrugs)),
    resetDraft: () => resetDraft(activeDataset),
    restoreSource: () => resetToOriginal(activeDataset),
  });

  const actions = useMemo<BoardActions>(
    () => ({
      destinations,
      addOptions,
      onBump: (slot, slug, direction) => update((manual) => bumpSlug(manual, slot, slug, direction)),
      onMove: (from, slug, to) => update((manual) => moveSlug(manual, from, slug, to)),
      onRemoveSlug: (slot, slug) => update((manual) => removeSlug(manual, slot, slug)),
      onAddSlug: (slot, slug) => update((manual) => addSlug(manual, slot, slug)),
      onSortSlot: (slot) => update((manual) => sortSlot(manual, slot, (slugs) => sortSlugsForDataset(activeDataset, slugs))),
      onPlaceSection: (categoryKey, sectionKey, targetSectionKey, placement) =>
        update((manual) => placeSection(manual, categoryKey, sectionKey, targetSectionKey, placement)),
      onRenameSection: (categoryKey, sectionKey, label) => update((manual) => renameSection(manual, categoryKey, sectionKey, label)),
      onAddSection: (categoryKey, label) => update((manual) => addSection(manual, categoryKey, label).manual),
      onRemoveSection: requestRemoveSection,
      onUpdateCategory: (categoryKey, patch) => update((manual) => updateCategoryIdentity(manual, categoryKey, patch)),
      onRemoveCategory: requestRemoveCategory,
    }),
    [activeDataset, addOptions, destinations, requestRemoveCategory, requestRemoveSection, sortSlugsForDataset, update],
  );

  const handleDrop = useCallback(
    (from: LayoutSlot, slug: string, to: LayoutSlot, index: number) => {
      update((manual) => moveSlug(manual, from, slug, to, index));
    },
    [update],
  );

  const handleSortAll = useCallback(() => {
    update((manual) => ({
      ...manual,
      categories: manual.categories.map((category) => ({
        ...category,
        drugs: sortSlugsForDataset(activeDataset, category.drugs),
        sections: category.sections.map((section) => ({ ...section, drugs: sortSlugsForDataset(activeDataset, section.drugs) })),
      })),
    }));
  }, [activeDataset, sortSlugsForDataset, update]);

  const handleApplyJson = useCallback(() => {
    try {
      applyJsonForDataset(activeDataset, rawJsonDraft);
    } catch (error) {
      setJsonErrorForDataset(activeDataset, error instanceof Error ? error.message : "Unable to parse JSON");
    }
  }, [activeDataset, applyJsonForDataset, rawJsonDraft, setJsonErrorForDataset]);

  const viewItems = useMemo<PublicSegmentedTabItem[]>(
    () => [
      { id: "all", label: "All", icon: SUBSTANCE_INDEX_ICON, prominence: "major" },
      ...board.map((category) => ({ id: category.key, label: category.label, icon: category.icon })),
    ],
    [board],
  );

  return (
    <div className="space-y-6">
      {commitPanel ? <div>{commitPanel}</div> : null}
      {confirmDialog}
      {dirtyDialog}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <EditorSegmentedControl
          label="Index dataset"
          value={activeDataset}
          onChange={(next) => guard(() => setActiveDataset(next as ManualDatasetKey))}
          options={DATASET_ORDER.map((key) => ({
            value: key,
            label: datasetDefinitions[key].label,
            icon: datasetDefinitions[key].icon,
          }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <EditorStatusPill tone="neutral">
            {draftManual.categories.length} categor{draftManual.categories.length === 1 ? "y" : "ies"}
          </EditorStatusPill>
          <EditorStatusPill tone={hasUnsavedChanges ? "warning" : "success"} live>
            {hasUnsavedChanges ? "Unapplied edits" : "Draft matches applied layout"}
          </EditorStatusPill>
        </div>
      </div>

      <EditorToolbar variant={enableStickyPanels ? "sticky" : "wrap"} label="Layout actions">
        <Button type="button" variant="accent" size="sm" disabled={!hasUnsavedChanges} onClick={() => saveDataset(activeDataset)}>
          <Icon icon="lucide:check" size={14} />
          Apply to draft
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={!hasUnsavedChanges} onClick={requestResetDraft}>
          Discard edits
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={requestRestoreSource}>
          Restore source
        </Button>
        <span className="mx-1 h-5 w-px bg-[var(--editor-panel-border)]" aria-hidden />
        <NewCategoryPopover onAdd={(label) => update((manual) => addCategory(manual, label, "").manual)} />
        <Button type="button" variant="outline" size="sm" onClick={handleSortAll} title="Sort every list the way the site used to: Common first, then A to Z">
          <Icon icon="lucide:arrow-down-a-z" size={14} />
          Sort all lists
        </Button>
        <Button type="button" variant={showJson ? "pillActive" : "ghost"} size="sm" aria-pressed={showJson} onClick={() => setShowJson((previous) => !previous)}>
          <Icon icon="lucide:braces" size={14} />
          JSON
        </Button>
        {saveNotice ? (
          <EditorStatusPill tone="success" live className="ml-auto">
            {saveNotice}
          </EditorStatusPill>
        ) : null}
      </EditorToolbar>

      {jsonError ? <EditorNotice notice={{ tone: "danger", message: jsonError }} /> : null}

      {showJson ? (
        <IndexLayoutJsonEditor
          label={`${activeDefinition.label} JSON layout`}
          value={rawJsonDraft}
          onApply={handleApplyJson}
          onChange={(nextValue) => {
            setRawJsonForDataset(activeDataset, nextValue);
            clearJsonErrorForDataset(activeDataset);
          }}
        />
      ) : (
        <div className="space-y-6">
          <div data-nosnippet>
            <PublicSegmentedTabs
              ariaLabel="Preview a tab of the public index"
              value={view}
              onValueChange={setView}
              items={viewItems}
              listClassName="justify-center"
            />
          </div>
          <p className="theme-text-faint text-center text-xs">
            Drag rows, or use the arrows and the row menu. Common always leads its category and Other always closes it, as on the site.
          </p>
          <IndexLayoutBoard dataset={activeDataset} board={board} view={view} actions={actions} onDrop={handleDrop} />
        </div>
      )}
    </div>
  );
}
