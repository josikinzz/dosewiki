"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicSegmentedTabs, type PublicSegmentedTabItem } from "@/components/layout/PublicSegmentedTabs";
import { SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT } from "@/components/pages/substanceIndexAllLayout";
import {
  SUBSTANCE_INDEX_ICON,
  buildSubstanceIndexTabItems,
  orderCategoriesForAllTab,
  resolveSubstanceIndexSuperTabs,
} from "@/components/pages/substanceIndexTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import {
  EditorSegmentedControl,
  EditorStatusPill,
  EditorToolbar,
  useConfirm,
} from "@/features/dev/components";
import { useDevMode } from "../../context/DevModeContext";
import { UNPLACED_SLOT, buildBoard, listDestinations, type BoardItem } from "./boardModel";
import { IndexLayoutBoard, type LayoutPanel } from "./IndexLayoutBoard";
import type { BoardActions } from "./IndexLayoutCardMenus";
import { createLayoutDataHelpers } from "./layoutDataUtils";
import {
  addCategory,
  addSlug,
  addSection,
  bumpSlug,
  collectPlacedSlugs,
  moveSlug,
  placeSection,
  removeCategory,
  removeSection,
  removeSlug,
  renameSection,
  slotsEqual,
  sortCategory,
  sortSlot,
  updateCategoryIdentity,
  type LayoutSlot,
} from "./layoutOps";
import { UnplacedTray } from "./UnplacedTray";
import { useLayoutConfirms } from "./useLayoutConfirms";
import { useLayoutHistory } from "./useLayoutHistory";
import { type IndexLayoutTabProps, type ManualDatasetKey, type SubstanceOption } from "./types";
import { areManualsEqual } from "./utils";

const DATASET_ORDER: ManualDatasetKey[] = ["psychoactive", "chemical", "mechanism"];

const DATASET_ICONS: Record<ManualDatasetKey, IconName> = {
  psychoactive: "fluent:brain-circuit-28-filled",
  chemical: "solar:benzene-ring-linear",
  mechanism: "fa-solid:cogs",
};

const DATASET_LABELS: Record<ManualDatasetKey, string> = {
  psychoactive: "Psychoactive class",
  chemical: "Chemical class",
  mechanism: "Mechanism of action",
};

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
          <Input
            id="new-category-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            inputSize="sm"
            placeholder="Anxiolytic"
          />
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
 * The public Substance Index, editable in place: the same tab strip, the same
 * column arrangement, the same panels, with handles that appear on hover. Every
 * gesture writes straight into the dev draft — undo is the safety net, and the
 * shell's commit panel is the only thing that reaches production.
 */
export function IndexLayoutTab({ commitPanel, enableStickyPanels }: IndexLayoutTabProps) {
  const {
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    replacePsychoactiveIndexManual,
    replaceChemicalIndexManual,
    replaceMechanismIndexManual,
    resetPsychoactiveIndexManual,
    resetChemicalIndexManual,
    resetMechanismIndexManual,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
  } = useDevMode();
  const { allSubstanceRecords, allSubstancesBySlug } = useLibrary();

  const [dataset, setDataset] = useState<ManualDatasetKey>("psychoactive");
  const [view, setView] = useState("all");

  const manual =
    dataset === "psychoactive"
      ? psychoactiveIndexManual
      : dataset === "chemical"
        ? chemicalIndexManual
        : mechanismIndexManual;
  const replace =
    dataset === "psychoactive"
      ? replacePsychoactiveIndexManual
      : dataset === "chemical"
        ? replaceChemicalIndexManual
        : replaceMechanismIndexManual;
  const resetDataset =
    dataset === "psychoactive"
      ? resetPsychoactiveIndexManual
      : dataset === "chemical"
        ? resetChemicalIndexManual
        : resetMechanismIndexManual;
  const getOriginal =
    dataset === "psychoactive"
      ? getOriginalPsychoactiveIndexManual
      : dataset === "chemical"
        ? getOriginalChemicalIndexManual
        : getOriginalMechanismIndexManual;

  const history = useLayoutHistory({ dataset, manual, replace });
  const { edit } = history;

  const { sortSlugsForDataset } = useMemo(
    () => createLayoutDataHelpers(allSubstanceRecords, allSubstancesBySlug),
    [allSubstanceRecords, allSubstancesBySlug],
  );

  const board = useMemo(() => buildBoard(manual, allSubstancesBySlug), [allSubstancesBySlug, manual]);
  const destinations = useMemo(() => listDestinations(board), [board]);
  const allSections = useMemo(() => board.flatMap((category) => category.sections), [board]);
  const isDirty = useMemo(() => !areManualsEqual(getOriginal(), manual), [getOriginal, manual]);

  const superTabs = useMemo(() => {
    if (dataset !== "psychoactive") return [];
    const keys = new Set(board.map((category) => category.key));
    return resolveSubstanceIndexSuperTabs((key) => keys.has(key));
  }, [board, dataset]);

  const substanceOptions = useMemo<SubstanceOption[]>(
    () =>
      allSubstanceRecords
        .map((record) => ({
          slug: record.slug,
          name: record.name,
          alias: record.aliases?.[0],
          isHidden: record.isHidden,
        }))
        .sort((first, second) => first.name.localeCompare(second.name)),
    [allSubstanceRecords],
  );

  const unplaced = useMemo(() => {
    const placed = collectPlacedSlugs(manual);
    const publicGaps: BoardItem[] = [];
    const hidden: BoardItem[] = [];
    for (const record of allSubstanceRecords) {
      if (placed.has(record.slug)) continue;
      const invisible = record.isHidden || record.isDirectUrlOnly;
      (invisible ? hidden : publicGaps).push({
        slug: record.slug,
        name: record.name,
        issues: invisible ? ["hidden"] : [],
        hiddenOnSite: record.isDirectUrlOnly,
      });
    }
    publicGaps.sort((first, second) => first.name.localeCompare(second.name));
    hidden.sort((first, second) => first.name.localeCompare(second.name));
    return { publicGaps, hidden };
  }, [allSubstanceRecords, manual]);

  // The add pickers accept anything unplaced, hidden articles included: an
  // editor placing one is how a hidden substance gets staged for release.
  const addOptions = useMemo(
    () =>
      [...unplaced.publicGaps, ...unplaced.hidden]
        .sort((first, second) => first.name.localeCompare(second.name))
        .map((item) => ({
          value: item.slug,
          label: item.name,
          hint: allSubstancesBySlug.get(item.slug)?.aliases?.[0],
        })),
    [allSubstancesBySlug, unplaced],
  );

  const { confirm, dialog: confirmDialog } = useConfirm();
  const { requestRemoveCategory, requestRemoveSection, requestRevertDataset } = useLayoutConfirms({
    confirm,
    datasetLabel: DATASET_LABELS[dataset],
    categories: manual.categories,
    substanceOptions,
    removeCategory: (categoryKey) => {
      edit((current) => removeCategory(current, categoryKey));
      if (view === categoryKey) setView("all");
    },
    removeSection: (categoryKey, sectionKey, keepDrugs) =>
      edit((current) => removeSection(current, categoryKey, sectionKey, keepDrugs)),
    revertDataset: () => {
      resetDataset();
      history.forget();
    },
  });

  const actions = useMemo<BoardActions>(
    () => ({
      destinations,
      addOptions,
      onBump: (slot, slug, direction) => edit((current) => bumpSlug(current, slot, slug, direction)),
      onMove: (from, slug, to) =>
        edit((current) =>
          slotsEqual(from, UNPLACED_SLOT)
            ? addSlug(current, to, slug)
            : slotsEqual(to, UNPLACED_SLOT)
              ? removeSlug(current, from, slug)
              : moveSlug(current, from, slug, to),
        ),
      onRemoveSlug: (slot, slug) => edit((current) => removeSlug(current, slot, slug)),
      onAddSlug: (slot, slug) => edit((current) => addSlug(current, slot, slug)),
      onSortSlot: (slot) =>
        edit((current) => sortSlot(current, slot, (slugs) => sortSlugsForDataset(dataset, slugs))),
      onSortCategory: (categoryKey) =>
        edit((current) => sortCategory(current, categoryKey, (slugs) => sortSlugsForDataset(dataset, slugs))),
      onPlaceSection: (categoryKey, sectionKey, targetSectionKey, placement) =>
        edit((current) => placeSection(current, categoryKey, sectionKey, targetSectionKey, placement)),
      onRenameSection: (categoryKey, sectionKey, label) =>
        edit((current) => renameSection(current, categoryKey, sectionKey, label)),
      onAddSection: (categoryKey, label) => edit((current) => addSection(current, categoryKey, label).manual),
      onRemoveSection: requestRemoveSection,
      onUpdateCategory: (categoryKey, patch) => edit((current) => updateCategoryIdentity(current, categoryKey, patch)),
      onRemoveCategory: requestRemoveCategory,
    }),
    [addOptions, dataset, destinations, edit, requestRemoveCategory, requestRemoveSection, sortSlugsForDataset],
  );

  const handleDrop = useCallback(
    (from: LayoutSlot, slug: string, to: LayoutSlot, index: number) => {
      if (slotsEqual(to, UNPLACED_SLOT)) {
        edit((current) => removeSlug(current, from, slug));
        return;
      }
      if (slotsEqual(from, UNPLACED_SLOT)) {
        // Appended first, then reordered: `addSlug` owns the slugify and the
        // "already listed" case, and `moveSlug` owns the landing position.
        edit((current) => moveSlug(addSlug(current, to, slug), to, slug, to, index));
        return;
      }
      edit((current) => moveSlug(current, from, slug, to, index));
    },
    [edit],
  );

  const tabItems = useMemo<PublicSegmentedTabItem[]>(() => {
    if (dataset === "psychoactive") {
      return buildSubstanceIndexTabItems(board.map((category) => ({ ...category, name: category.label })));
    }
    return [
      { id: "all", label: "All", icon: SUBSTANCE_INDEX_ICON, prominence: "major" },
      ...board.map((category) => ({ id: category.key, label: category.label, icon: category.icon })),
    ];
  }, [board, dataset]);

  const panels = useMemo<LayoutPanel[]>(() => {
    if (view === "all") {
      return orderCategoriesForAllTab(board).map((category) => ({
        key: category.key,
        category,
        sections: category.sections,
        title: category.label,
        hideIcon: false,
        chrome: "category" as const,
      }));
    }

    const superTab = superTabs.find((tab) => tab.id === view);
    if (superTab) {
      return superTab.memberKeys
        .map((key) => board.find((category) => category.key === key))
        .filter((category): category is (typeof board)[number] => category !== undefined)
        .map((category) => ({
          key: category.key,
          category,
          sections: category.sections,
          title: category.label,
          hideIcon: false,
          chrome: "category" as const,
        }));
    }

    const category = board.find((entry) => entry.key === view);
    if (!category) return [];
    return category.sections.map((section) => ({
      key: section.id,
      category,
      sections: [section],
      title: section.label ?? category.label,
      hideIcon: true,
      chrome: "section" as const,
      siblings: category.sections,
    }));
  }, [board, superTabs, view]);

  const resolveName = useCallback(
    (slug: string) => allSubstancesBySlug.get(slug)?.name ?? slug,
    [allSubstancesBySlug],
  );

  // The whole tab is one editing surface, so undo belongs to the window rather
  // than to any control: a drag ends with the pointer anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? "")) return;
      event.preventDefault();
      if (event.shiftKey) {
        history.redo();
      } else {
        history.undo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history]);

  const placedCount = useMemo(() => collectPlacedSlugs(manual).size, [manual]);

  return (
    <div className="space-y-6">
      {commitPanel ? <div>{commitPanel}</div> : null}
      {confirmDialog}

      <EditorToolbar variant={enableStickyPanels ? "sticky" : "wrap"} label="Index layout actions">
        <EditorSegmentedControl
          label="Index dataset"
          value={dataset}
          onChange={(next) => {
            setDataset(next as ManualDatasetKey);
            setView("all");
          }}
          options={DATASET_ORDER.map((key) => ({
            value: key,
            label: DATASET_LABELS[key],
            icon: DATASET_ICONS[key],
          }))}
        />
        <span className="mx-1 h-5 w-px bg-[var(--editor-panel-border)]" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!history.canUndo}
          onClick={history.undo}
          title="Undo the last layout edit (⌘Z)"
        >
          <Icon icon="lucide:undo-2" size={14} />
          Undo
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!history.canRedo}
          onClick={history.redo}
          title="Redo (⇧⌘Z)"
        >
          <Icon icon="lucide:redo-2" size={14} />
          Redo
        </Button>
        <NewCategoryPopover onAdd={(label) => edit((current) => addCategory(current, label, "").manual)} />
        <Button type="button" variant="ghost" size="sm" disabled={!isDirty} onClick={requestRevertDataset}>
          Revert to production
        </Button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <EditorStatusPill tone="neutral">
            {board.length} categor{board.length === 1 ? "y" : "ies"} · {placedCount} placed
          </EditorStatusPill>
          <EditorStatusPill tone={isDirty ? "warning" : "success"} live>
            {isDirty ? "Uncommitted draft edits" : "Matches production"}
          </EditorStatusPill>
        </span>
      </EditorToolbar>

      <div data-nosnippet>
        <PublicSegmentedTabs
          ariaLabel="Edit a tab of the public index"
          value={view}
          onValueChange={setView}
          items={tabItems}
          listClassName="justify-center"
        />
      </div>

      <IndexLayoutBoard
        panels={panels}
        columnLayout={dataset === "psychoactive" && view === "all" ? SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT : undefined}
        actions={actions}
        sections={allSections}
        onDrop={handleDrop}
        resolveName={resolveName}
        emptyMessage={
          view === "all"
            ? "This index has no categories yet. Add one from the toolbar."
            : "This category no longer exists in the draft."
        }
        tray={
          <UnplacedTray
            items={unplaced.publicGaps}
            hiddenItems={unplaced.hidden}
            destinations={destinations}
            onMove={actions.onMove}
          />
        }
      />
    </div>
  );
}
