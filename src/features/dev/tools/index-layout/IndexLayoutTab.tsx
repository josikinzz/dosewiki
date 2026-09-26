"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import {
  EditorField,
  EditorSection,
  EditorSelect,
  Notice,
  useConfirm,
  useDevShortcuts,
  type DevShortcut,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { slugify } from "@/utils/slug";
import { useDevMode } from "../../context/DevModeContext";
import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { DevWorkingChangesPanel } from "../../pages/DevWorkingChangesPanel";
import { CappedList } from "../home/homeParts";
import { UNPLACED_SLOT, buildBoard, listDestinations, type BoardItem } from "./boardModel";
import { IndexLayoutBoard, type LayoutPanel } from "./IndexLayoutBoard";
import type { BoardActions } from "./IndexLayoutCardMenus";
import { createLayoutDataHelpers } from "./layoutDataUtils";
import { rowId } from "./LayoutDrugRow";
import { LayoutMoveDialog, type LayoutMoveRequest } from "./LayoutMoveDialog";
import {
  DATASET_LABELS,
  DATASET_ORDER,
  DATASET_SHORT_LABELS,
  countNoun,
  describeLayoutChanges,
  isLayoutConflictMessage,
  normalizeManual,
  slotName,
  type LayoutChange,
} from "./layoutModel";
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
import { type IndexLayoutTabProps, type ManualDatasetKey, type ManualIndexConfig, type SubstanceOption } from "./types";
import { areManualsEqual } from "./utils";

const DATASET_ICONS: Record<ManualDatasetKey, IconName> = {
  psychoactive: "fluent:brain-circuit-28-filled",
  chemical: "solar:benzene-ring-linear",
  mechanism: "fa-solid:cogs",
};

/** The board's window-wide keys, for the shell's `?` sheet. */
const HISTORY_SHORTCUTS: readonly DevShortcut[] = [
  { keys: "/", label: "Find a substance on the board" },
  { keys: "Cmd+Z or Ctrl+Z", label: "Undo the last layout change" },
  { keys: "Shift+Cmd+Z or Shift+Ctrl+Z", label: "Redo" },
];

const WORKING_CHANGES_ID = "index-layout-working-changes";

type DatasetState = { manual: ManualIndexConfig; original: ManualIndexConfig; dirty: boolean };

/** The three datasets as one choice, label over a quiet state line, one row on a phone. */
function DatasetChoices({
  value,
  onChange,
  dirty,
  counts,
}: {
  value: ManualDatasetKey;
  onChange: (next: ManualDatasetKey) => void;
  dirty: Record<ManualDatasetKey, boolean>;
  counts: Record<ManualDatasetKey, number>;
}) {
  return (
    <div
      role="group"
      aria-label="Index dataset"
      className="grid grid-cols-3 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
    >
      {DATASET_ORDER.map((key) => {
        const selected = key === value;
        return (
          <Button
            key={key}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={cn("h-auto min-h-11 w-full flex-col gap-0.5 rounded-control px-1.5 py-1.5 leading-tight", TOUCH_HALO_Y)}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Icon icon={DATASET_ICONS[key]} size={14} className="hidden shrink-0 sm:inline" />
              <span className="sm:hidden">{DATASET_SHORT_LABELS[key]}</span>
              <span className="hidden sm:inline">{DATASET_LABELS[key]}</span>
            </span>
            <span className={cn("flex items-center gap-1.5 text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
              <span className="sr-only">, </span>
              {countNoun(counts[key], "category", "categories")}
              {dirty[key] ? (
                <>
                  <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
                  <span className="sr-only">, uncommitted changes</span>
                </>
              ) : null}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function NewCategoryPopover({
  open,
  onOpenChange,
  onAdd,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (label: string) => void;
  existing: readonly string[];
}) {
  const [label, setLabel] = useState("");
  const taken = existing.some((name) => name.trim().toLowerCase() === label.trim().toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setLabel("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Icon icon="lucide:plus" size={14} />
          New category
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(18rem,calc(100vw-2rem))] p-3">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!label.trim()) return;
            onAdd(label.trim());
            onOpenChange(false);
          }}
        >
          <EditorField
            label="Category name"
            htmlFor="new-category-label"
            description={taken
              ? "A category with this name exists already. A second one gets its own key."
              : "It lands in the shortest column of the All tab. The icon follows the name; change it from the card's menu."}
          >
            <Input
              id="new-category-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              inputSize="sm"
              placeholder="Anxiolytic"
              autoComplete="off"
            />
          </EditorField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
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

type FinderHit = { key: string; name: string; where: string; slot: LayoutSlot | null; slug: string };

/**
 * "Where does 2C-B live?" in one field: every list on the board that holds a
 * match, and the tray when it holds none. Picking a hit focuses that row (the
 * view switches to All when the open tab hides it); a substance outside the
 * index opens the list picker.
 */
function BoardFinder({
  hits,
  query,
  onQueryChange,
  onPick,
  inputRef,
}: {
  hits: FinderHit[];
  query: string;
  onQueryChange: (value: string) => void;
  onPick: (hit: FinderHit) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const shown = hits.slice(0, 8);
  return (
    <div className="w-full max-w-md space-y-2">
      <div className="relative">
        <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              onQueryChange("");
            }
          }}
          inputSize="sm"
          className="pl-9 pr-10"
          aria-label="Find a substance on the board"
          aria-keyshortcuts="/"
          placeholder="Find a substance on the board"
          autoComplete="off"
        />
        {query ? null : (
          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
            <kbd className="theme-dev-kbd">/</kbd>
          </span>
        )}
      </div>
      {query.trim() ? (
        <div aria-live="polite">
          {shown.length === 0 ? (
            <p className="theme-text-muted px-1 text-sm">{`Nothing on this board or in the tray matches “${query.trim()}”.`}</p>
          ) : (
            <ul aria-label="Matches on the board" className="theme-dev-link-list -mx-2.5">
              {shown.map((hit) => (
                <li key={hit.key}>
                  <button
                    type="button"
                    onClick={() => onPick(hit)}
                    className="theme-dev-link-row flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2.5 py-1.5 text-left text-sm"
                  >
                    <span className="min-w-0">
                      <span className="theme-text-primary block break-words font-medium">{hit.name}</span>
                      <span className="theme-text-muted block break-words text-xs">
                        <span className="sr-only">, </span>
                        {hit.where}
                      </span>
                    </span>
                    <Icon icon={hit.slot ? "lucide:locate-fixed" : "lucide:corner-down-right"} size={14} className="theme-dev-link-row-chevron shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hits.length > shown.length ? (
            <p className="theme-text-faint px-1 pt-1 text-xs">{`${hits.length - shown.length} more. Type more of the name.`}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The layout changes in words, per dataset, for the Working changes panel and the commit confirm. */
function LayoutChangeList({ groups, compact = false }: { groups: Array<{ key: ManualDatasetKey; changes: LayoutChange[] }>; compact?: boolean }) {
  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {groups.map(({ key, changes }) => (
        <section key={key} aria-label={`${DATASET_LABELS[key]} layout changes`} className="space-y-1.5">
          <h3 className="type-meta-label theme-text-muted">{`${DATASET_LABELS[key]}, ${countNoun(changes.length, "change")}`}</h3>
          {compact ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {changes.map((change) => (
                <li key={change.key} className="theme-text-primary break-words">{change.text}</li>
              ))}
            </ul>
          ) : (
            <CappedList
              items={changes}
              getKey={(change) => change.key}
              label={`${DATASET_LABELS[key]} layout changes`}
              noun="changes"
              renderItem={(change) => (
                <p className="theme-text-primary min-h-10 break-words px-2.5 py-2 text-sm">{change.text}</p>
              )}
            />
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * The public Substance Index, editable in place: the same tab strip, the same
 * column arrangement, the same panels, with handles on every row. Every
 * gesture writes straight into the working changes; undo is the safety net,
 * and the Working changes panel is the only thing that reaches production.
 */
export function IndexLayoutTab({
  commitPanel,
  commit,
  datasetMarkdown = "",
  hasDatasetChanges = false,
  onCopyDatasetMarkdown,
  onDownloadDatasetMarkdown,
}: IndexLayoutTabProps) {
  const devMode = useDevMode();
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
    retryIndexLayouts,
  } = devMode;
  const { allSubstanceRecords, allSubstancesBySlug } = useLibrary();

  const [dataset, setDataset] = useState<ManualDatasetKey>("psychoactive");
  const [view, setView] = useState("all");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [moveRequest, setMoveRequest] = useState<LayoutMoveRequest | null>(null);
  const [lastChange, setLastChange] = useState<string | null>(null);
  const [finderQuery, setFinderQuery] = useState("");
  const finderRef = useRef<HTMLInputElement | null>(null);
  const [diffNotice, setDiffNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const changesHeadingRef = useRef<HTMLHeadingElement | null>(null);
  // A row a menu or the list picker just moved or removed: focus goes to it
  // (or to the row that took its place) once the board has redrawn.
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const datasets = useMemo<Record<ManualDatasetKey, DatasetState>>(() => {
    const read = (manual: ManualIndexConfig, original: ManualIndexConfig): DatasetState => ({
      manual,
      original,
      dirty: !areManualsEqual(normalizeManual(original), normalizeManual(manual)),
    });
    return {
      psychoactive: read(psychoactiveIndexManual, getOriginalPsychoactiveIndexManual()),
      chemical: read(chemicalIndexManual, getOriginalChemicalIndexManual()),
      mechanism: read(mechanismIndexManual, getOriginalMechanismIndexManual()),
    };
  }, [
    chemicalIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
    getOriginalPsychoactiveIndexManual,
    mechanismIndexManual,
    psychoactiveIndexManual,
  ]);

  const rawManual = datasets[dataset].manual;
  const manual = useMemo(() => normalizeManual(rawManual), [rawManual]);
  const replace =
    dataset === "psychoactive"
      ? replacePsychoactiveIndexManual
      : dataset === "chemical"
        ? replaceChemicalIndexManual
        : replaceMechanismIndexManual;
  const resets = useMemo<Record<ManualDatasetKey, () => void>>(
    () => ({ psychoactive: resetPsychoactiveIndexManual, chemical: resetChemicalIndexManual, mechanism: resetMechanismIndexManual }),
    [resetChemicalIndexManual, resetMechanismIndexManual, resetPsychoactiveIndexManual],
  );

  const history = useLayoutHistory({ dataset, manual: rawManual, replace });
  // Every op reads a manual with both lists present; a no-op hands back the
  // stored manual itself, so the trail never records a step that changed nothing.
  const { edit: recordEdit } = history;
  const edit = useCallback(
    (transform: (current: ManualIndexConfig) => ManualIndexConfig, label?: string) => {
      const changed = recordEdit((raw) => {
        const safe = normalizeManual(raw);
        const next = transform(safe);
        return next === safe ? raw : next;
      }, label);
      if (changed && label) setLastChange(`${label}.`);
    },
    [recordEdit],
  );

  const { sortSlugsForDataset } = useMemo(
    () => createLayoutDataHelpers(allSubstanceRecords, allSubstancesBySlug),
    [allSubstanceRecords, allSubstancesBySlug],
  );

  const board = useMemo(() => buildBoard(manual, allSubstancesBySlug), [allSubstancesBySlug, manual]);
  const destinations = useMemo(() => listDestinations(board), [board]);
  const allSections = useMemo(() => board.flatMap((category) => category.sections), [board]);
  const isDirty = datasets[dataset].dirty;
  const dirtyDatasets = useMemo<Record<ManualDatasetKey, boolean>>(
    () => ({ psychoactive: datasets.psychoactive.dirty, chemical: datasets.chemical.dirty, mechanism: datasets.mechanism.dirty }),
    [datasets],
  );
  const categoryCounts = useMemo<Record<ManualDatasetKey, number>>(
    () => ({
      psychoactive: normalizeManual(datasets.psychoactive.manual).categories.length,
      chemical: normalizeManual(datasets.chemical.manual).categories.length,
      mechanism: normalizeManual(datasets.mechanism.manual).categories.length,
    }),
    [datasets],
  );

  useEffect(() => {
    if (!pendingFocus) return;
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector(`[data-row="${CSS.escape(pendingFocus)}"]`);
      const target = row?.querySelector<HTMLElement>('[data-control="menu"]') ?? row?.querySelector<HTMLElement>("button");
      target?.focus();
      setPendingFocus(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingFocus, board]);

  const resolveName = useCallback(
    (slug: string) => allSubstancesBySlug.get(slug)?.name ?? slug,
    [allSubstancesBySlug],
  );
  const listName = useCallback((slot: LayoutSlot) => slotName(board, slot), [board]);

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

  const placed = useMemo(() => collectPlacedSlugs(manual), [manual]);
  const unplaced = useMemo(() => {
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
  }, [allSubstanceRecords, placed]);

  // The add pickers accept anything unplaced, hidden articles included: an
  // editor placing one is how a hidden substance gets staged for release.
  const addOptions = useMemo(
    () =>
      [...unplaced.publicGaps, ...unplaced.hidden]
        .sort((first, second) => first.name.localeCompare(second.name))
        .map((item) => {
          const alias = allSubstancesBySlug.get(item.slug)?.aliases?.[0];
          // Placing a hidden article stages it for release, so the picker says so.
          const hidden = item.issues.includes("hidden") ? "Hidden on the site" : undefined;
          return {
            value: item.slug,
            label: item.name,
            hint: [hidden, alias].filter(Boolean).join(" · ") || undefined,
          };
        }),
    [allSubstancesBySlug, unplaced],
  );

  const { confirm, dialog: confirmDialog } = useConfirm();
  const { requestRemoveCategory, requestRemoveSection, requestRevertDataset } = useLayoutConfirms({
    confirm,
    datasetLabel: DATASET_LABELS[dataset],
    categories: manual.categories,
    substanceOptions,
    removeCategory: (categoryKey) => {
      const label = manual.categories.find((category) => category.key === categoryKey)?.label ?? categoryKey;
      edit((current) => removeCategory(current, categoryKey), `Removed the ${label} category`);
      if (view === categoryKey) setView("all");
    },
    removeSection: (categoryKey, sectionKey, keepDrugs) => {
      const label = listName({ categoryKey, sectionKey });
      edit((current) => removeSection(current, categoryKey, sectionKey, keepDrugs), `Removed the ${label} section`);
    },
    revertDataset: () => {
      resets[dataset]();
      history.forget();
      setLastChange(`Reverted the ${DATASET_LABELS[dataset]} layout to the live one.`);
    },
  });

  // Where each substance sat when the dataset was loaded, so a row the
  // working changes moved, added or reordered carries a quiet mark.
  const originalLists = useMemo(() => {
    const lists = new Map<string, string[]>();
    for (const category of normalizeManual(datasets[dataset].original).categories) {
      lists.set(`${category.key}::`, category.drugs);
      for (const section of category.sections) lists.set(`${category.key}::${section.key}`, section.drugs);
    }
    return lists;
  }, [dataset, datasets]);
  const isChanged = useCallback(
    (slot: LayoutSlot, slug: string) => {
      const before = originalLists.get(`${slot.categoryKey}::${slot.sectionKey ?? ""}`);
      if (!before || !before.includes(slug)) return true;
      const now = allSections.find((section) => slotsEqual(section.slot, slot))?.items.map((item) => item.slug) ?? [];
      const shared = now.filter((entry) => before.includes(entry));
      const sharedBefore = before.filter((entry) => shared.includes(entry));
      return shared.indexOf(slug) !== sharedBefore.indexOf(slug);
    },
    [allSections, originalLists],
  );

  const slotHolds = useCallback(
    (slot: LayoutSlot, slug: string) =>
      allSections.find((section) => slotsEqual(section.slot, slot))?.items.some((item) => item.slug === slug) ?? false,
    [allSections],
  );

  const actions = useMemo<BoardActions>(
    () => ({
      destinations,
      addOptions,
      listName,
      onBump: (slot, slug, direction) =>
        edit((current) => bumpSlug(current, slot, slug, direction), `Moved ${resolveName(slug)} ${direction} in ${listName(slot)}`),
      onPlace: (slot, slug, place) =>
        edit(
          (current) => moveSlug(current, slot, slug, slot, place === "top" ? 0 : Number.MAX_SAFE_INTEGER),
          `Moved ${resolveName(slug)} to the ${place === "top" ? "top" : "end"} of ${listName(slot)}`,
        ),
      onRequestMove: setMoveRequest,
      onMove: (from, slug, to) =>
        edit(
          (current) =>
            slotsEqual(from, UNPLACED_SLOT)
              ? addSlug(current, to, slug)
              : slotsEqual(to, UNPLACED_SLOT)
                ? removeSlug(current, from, slug)
                : moveSlug(current, from, slug, to),
          slotsEqual(from, UNPLACED_SLOT)
            ? `Placed ${resolveName(slug)} in ${listName(to)}`
            : slotsEqual(to, UNPLACED_SLOT)
              ? `Took ${resolveName(slug)} out of ${listName(from)}`
              : `Moved ${resolveName(slug)} to ${listName(to)}`,
        ),
      onRemoveSlug: (slot, slug) => {
        const items = allSections.find((section) => slotsEqual(section.slot, slot))?.items ?? [];
        const at = items.findIndex((item) => item.slug === slug);
        const neighbour = items[at + 1] ?? items[at - 1];
        edit((current) => removeSlug(current, slot, slug), `Removed ${resolveName(slug)} from ${listName(slot)}`);
        if (neighbour) setPendingFocus(rowId(slot, neighbour.slug));
      },
      onAddSlug: (slot, slug) =>
        edit((current) => addSlug(current, slot, slug), `Added ${resolveName(slug)} to ${listName(slot)}`),
      onSortSlot: (slot) =>
        edit((current) => sortSlot(current, slot, (slugs) => sortSlugsForDataset(dataset, slugs)), `Sorted ${listName(slot)} A to Z`),
      onSortCategory: (categoryKey) =>
        edit(
          (current) => sortCategory(current, categoryKey, (slugs) => sortSlugsForDataset(dataset, slugs)),
          `Sorted every list in ${listName({ categoryKey, sectionKey: null })} A to Z`,
        ),
      onPlaceSection: (categoryKey, sectionKey, targetSectionKey, placement) =>
        edit(
          (current) => placeSection(current, categoryKey, sectionKey, targetSectionKey, placement),
          `Moved the ${listName({ categoryKey, sectionKey })} section ${placement === "before" ? "up" : "down"}`,
        ),
      onRenameSection: (categoryKey, sectionKey, label) =>
        edit(
          (current) => renameSection(current, categoryKey, sectionKey, label),
          `Renamed ${listName({ categoryKey, sectionKey })} to ${label}`,
        ),
      onAddSection: (categoryKey, label) =>
        edit(
          (current) => addSection(current, categoryKey, label).manual,
          `Added the ${label} section to ${listName({ categoryKey, sectionKey: null })}`,
        ),
      onRemoveSection: requestRemoveSection,
      onUpdateCategory: (categoryKey, patch) =>
        edit(
          (current) => updateCategoryIdentity(current, categoryKey, patch),
          `Changed the name and icon of ${listName({ categoryKey, sectionKey: null })}`,
        ),
      onRemoveCategory: requestRemoveCategory,
      isChanged,
    }),
    [addOptions, allSections, isChanged, dataset, destinations, edit, listName, requestRemoveCategory, requestRemoveSection, resolveName, sortSlugsForDataset],
  );

  const handleDrop = useCallback(
    (from: LayoutSlot, slug: string, to: LayoutSlot, index: number) => {
      const name = resolveName(slug);
      if (slotsEqual(to, UNPLACED_SLOT)) {
        edit((current) => removeSlug(current, from, slug), `Took ${name} out of ${listName(from)}`);
        return;
      }
      if (slotsEqual(from, UNPLACED_SLOT)) {
        // Appended first, then reordered: `addSlug` owns the slugify and the
        // "already listed" case, and `moveSlug` owns the landing position.
        edit((current) => moveSlug(addSlug(current, to, slug), to, slug, to, index), `Placed ${name} in ${listName(to)}`);
        return;
      }
      edit(
        (current) => moveSlug(current, from, slug, to, index),
        slotsEqual(from, to) ? `Moved ${name} to position ${index + 1} in ${listName(to)}` : `Moved ${name} to ${listName(to)}`,
      );
    },
    [edit, listName, resolveName],
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

  const finderHits = useMemo<FinderHit[]>(() => {
    const needle = finderQuery.trim().toLowerCase();
    if (!needle) return [];
    const hits: FinderHit[] = [];
    for (const section of allSections) {
      for (const item of section.items) {
        if (!item.name.toLowerCase().includes(needle) && !item.slug.includes(needle)) continue;
        hits.push({ key: rowId(section.slot, item.slug), name: item.name, where: listName(section.slot), slot: section.slot, slug: item.slug });
      }
    }
    for (const item of [...unplaced.publicGaps, ...unplaced.hidden]) {
      if (!item.name.toLowerCase().includes(needle) && !item.slug.includes(needle)) continue;
      hits.push({ key: `tray:${item.slug}`, name: item.name, where: "Not in this index. Pick a list for it.", slot: null, slug: item.slug });
    }
    return hits;
  }, [allSections, finderQuery, listName, unplaced]);

  const pickHit = (hit: FinderHit) => {
    setFinderQuery("");
    if (!hit.slot) {
      setMoveRequest({ from: UNPLACED_SLOT, slug: hit.slug, name: hit.name, fromLabel: null });
      return;
    }
    const slot = hit.slot;
    const visible = panels.some((panel) => panel.sections.some((section) => slotsEqual(section.slot, slot)));
    if (!visible) setView("all");
    setPendingFocus(rowId(slot, hit.slug));
  };

  const undo = useCallback(() => {
    const label = history.undo();
    if (history.canUndo) setLastChange(label ? `Undid: ${label.charAt(0).toLowerCase()}${label.slice(1)}.` : "Undid the last change.");
  }, [history]);
  const redo = useCallback(() => {
    const label = history.redo();
    if (history.canRedo) setLastChange(label ? `Redid: ${label.charAt(0).toLowerCase()}${label.slice(1)}.` : "Redid the change.");
  }, [history]);

  // The layout changes of every dataset, in words, for the panel and the confirm.
  const changeGroups = useMemo(
    () =>
      DATASET_ORDER.filter((key) => datasets[key].dirty)
        .map((key) => ({ key, changes: describeLayoutChanges(datasets[key].original, datasets[key].manual, resolveName) }))
        .filter((group) => group.changes.length > 0),
    [datasets, resolveName],
  );
  const changedDatasets = DATASET_ORDER.filter((key) => datasets[key].dirty);

  const requestCommit = useCallback(() => {
    commit?.requestCommit(changeGroups.length > 0 ? <LayoutChangeList groups={changeGroups} compact /> : undefined);
  }, [changeGroups, commit]);

  const production = commit?.destination !== "proposal";
  useDevShortcuts(useMemo<DevShortcut[]>(
    () => [
      ...HISTORY_SHORTCUTS,
      ...(commit ? [{ keys: "Cmd+S", label: production ? "Commit your working changes (asks first)" : "Submit your working changes for review" }] : []),
    ],
    [commit, production],
  ));

  // The whole tab is one editing surface, so undo belongs to the window rather
  // than to any control: a drag ends with the pointer anywhere. Cmd+S does what
  // the commit button does.
  const keyRef = useRef({ undo, redo, commit, requestCommit });
  keyRef.current = { undo, redo, commit, requestCommit };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.defaultPrevented) {
        const target = event.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
        if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
        event.preventDefault();
        finderRef.current?.focus();
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if (key === "s") {
        const current = keyRef.current;
        if (!current.commit) return;
        event.preventDefault();
        if (!dialogOpen && current.commit.canCommit) current.requestCommit();
        return;
      }
      if (key !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? "")) return;
      if (dialogOpen) return;
      event.preventDefault();
      if (event.shiftKey) keyRef.current.redo();
      else keyRef.current.undo();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A refused commit because a layout moved on: fetch the latest now, so
  // "Load the latest layout" has it when the editor asks.
  const conflictNotice = commit?.notice?.type === "error" && isLayoutConflictMessage(commit.notice.message);
  useEffect(() => {
    if (conflictNotice) retryIndexLayouts?.();
  }, [conflictNotice, retryIndexLayouts]);

  // A commit or a submission makes the drafts the new starting point: the
  // undo trail no longer leads anywhere safe, so it goes. A submission is not
  // live, so the dataset line says it waits for review.
  const [submittedDatasets, setSubmittedDatasets] = useState<ManualDatasetKey[]>([]);
  const dirtyBeforeCommit = useRef<ManualDatasetKey[]>([]);
  if (changedDatasets.length > 0) dirtyBeforeCommit.current = changedDatasets;
  const commitNotice = commit?.notice ?? null;
  const { forgetAll } = history;
  useEffect(() => {
    if (commitNotice?.type !== "success") return;
    forgetAll();
    setLastChange(null);
    if (commit?.destination === "proposal") setSubmittedDatasets(dirtyBeforeCommit.current);
    else setSubmittedDatasets([]);
  }, [commit?.destination, commitNotice, forgetAll]);

  const loadLatest = useCallback(() => {
    const names = changedDatasets.map((key) => DATASET_LABELS[key]);
    confirm({
      title: "Load the latest layouts?",
      description: `Your changes to the ${names.join(" and ")} ${names.length === 1 ? "layout are" : "layouts are"} dropped and the layouts load as they are live now. Changes from other tools stay.`,
      confirmLabel: "Drop my changes and load",
      destructive: true,
      onConfirm: () => {
        retryIndexLayouts?.();
        for (const key of changedDatasets) resets[key]();
        history.forget();
        commit?.dismissNotice();
        setLastChange("Loaded the latest layouts.");
      },
    });
  }, [changedDatasets, commit, confirm, history, resets, retryIndexLayouts]);

  const undoKey = useModifierKeyLabel("Z");
  const redoKey = undoKey.startsWith("⌘") ? "⇧⌘Z" : "Ctrl Shift Z";
  const saveKeyLabel = useModifierKeyLabel("S");
  const placedCount = placed.size;
  const layoutScope = commit?.scope.filter((entry) => entry.id !== "articles") ?? [];
  const otherScope = commit?.scope.filter((entry) => layoutScope.every((layout) => layout.id !== entry.id)) ?? [];

  const pendingSummary = changedDatasets.length > 0
    ? `${changedDatasets.length === 1 ? `The ${DATASET_LABELS[changedDatasets[0]]} layout` : `${changedDatasets.length} layouts`} changed, not live yet.`
    : "Changes from another tool wait here, not live yet.";

  const reviewAndCommit = () => {
    const panel = document.getElementById(WORKING_CHANGES_ID);
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    changesHeadingRef.current?.focus({ preventScroll: true });
  };

  const workingChanges = commit ? (
    <DevWorkingChangesPanel
      commit={commit}
      id={WORKING_CHANGES_ID}
      headingRef={changesHeadingRef}
      idleSummary="Nothing waiting to commit. Moves, new lists and removals collect here."
      pendingSummary={pendingSummary}
      summaryNote={otherScope.length > 0
        ? `Also in this commit: ${otherScope.map((entry) => `${entry.label} (${entry.countLabel})`).join(", ")}.`
        : undefined}
      describeFailure={(message) =>
        isLayoutConflictMessage(message)
          ? {
              message: "Someone published a newer index layout after you started, so nothing was committed. Your changes are still here.",
              actions: changedDatasets.length > 0 ? (
                <Button type="button" variant="outline" size="xs" onClick={loadLatest}>
                  Load the latest layout
                </Button>
              ) : undefined,
            }
          : null}
      saveKeyLabel={saveKeyLabel}
      onCommit={requestCommit}
      changes={changeGroups.length > 0 ? <LayoutChangeList groups={changeGroups} /> : null}
      diff={onCopyDatasetMarkdown && onDownloadDatasetMarkdown ? {
        markdown: datasetMarkdown,
        hasChanges: hasDatasetChanges,
        onCopy: () => {
          onCopyDatasetMarkdown()
            .then(() => setDiffNotice({ tone: "success", message: "Copied the diff." }))
            .catch(() => setDiffNotice({ tone: "danger", message: "Could not copy the diff. Download it instead." }));
        },
        onDownload: () => {
          onDownloadDatasetMarkdown();
          setDiffNotice({ tone: "success", message: "Downloaded the diff." });
        },
        disabled: commit.isSaving,
        feedback: diffNotice ? (
          <Notice placement="inline" tone={diffNotice.tone} dismiss={() => setDiffNotice(null)}>{diffNotice.message}</Notice>
        ) : undefined,
      } : undefined}
    />
  ) : commitPanel ? <div>{commitPanel}</div> : null;

  const emptyView = view === "all" ? (
    <div className="mx-auto max-w-md space-y-3 text-center">
      <p className="theme-text-primary text-base font-semibold">{`No categories in the ${DATASET_LABELS[dataset]} layout yet`}</p>
      <p className="theme-text-muted text-sm">Readers see an empty index until one exists. Start with a category, then add its substances.</p>
      <Button type="button" variant="accent" size="sm" onClick={() => setNewCategoryOpen(true)}>
        <Icon icon="lucide:plus" size={14} />
        Add a category
      </Button>
    </div>
  ) : (
    <div className="mx-auto max-w-md space-y-3 text-center">
      <p className="theme-text-muted text-sm">This category no longer exists in the draft.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setView("all")}>
        Show all categories
      </Button>
    </div>
  );

  return (
    <div className="space-y-8">
      {workingChanges}
      {confirmDialog}

      <EditorSection
        icon="lucide:layout-grid"
        title="Index layout"
        description="The public Substance Index as readers see it. Drag a substance by its handle, or use its menu; changes wait in your working changes until you commit."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-2xl">
              <DatasetChoices
                value={dataset}
                onChange={(next) => {
                  setDataset(next);
                  setView("all");
                  setLastChange(null);
                }}
                dirty={dirtyDatasets}
                counts={categoryCounts}
              />
            </div>
            <div role="group" aria-label="Layout actions" className="flex flex-wrap items-center gap-2">
              <NewCategoryPopover
                open={newCategoryOpen}
                onOpenChange={setNewCategoryOpen}
                existing={manual.categories.map((category) => category.label)}
                onAdd={(label) => edit((current) => addCategory(current, label, "").manual, `Added the ${label} category`)}
              />
              <Button type="button" variant="ghostDestructive" size="sm" disabled={!isDirty} onClick={requestRevertDataset}>
                <Icon icon="lucide:rotate-ccw" size={14} />
                Revert layout
              </Button>
            </div>
          </div>
          <p className="theme-text-muted text-sm tabular-nums" aria-live="polite">
            <span className="theme-text-primary font-medium">{DATASET_LABELS[dataset]}</span>
            {`: ${countNoun(board.length, "category", "categories")}, ${countNoun(placedCount, "substance")} placed, `}
            {unplaced.publicGaps.length === 0
              ? "every public substance in place. "
              : `${countNoun(unplaced.publicGaps.length, "public substance")} left out. `}
            {isDirty ? (
              <span className="theme-text-primary inline-flex items-center gap-1.5">
                <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
                Changed, not committed.
              </span>
            ) : submittedDatasets.includes(dataset) ? (
              <span>Submitted for review; not live until an admin applies it.</span>
            ) : (
              <span>Same as the live index.</span>
            )}
          </p>
          <BoardFinder hits={finderHits} query={finderQuery} onQueryChange={setFinderQuery} onPick={pickHit} inputRef={finderRef} />
        </div>
      </EditorSection>

      <div className="space-y-6">
        {/* The reader's strip from md; a phone gets one select, since the strip wraps to six rows there. */}
        <div data-nosnippet className="hidden md:block">
          <PublicSegmentedTabs
            ariaLabel="Edit a tab of the public index"
            value={view}
            onValueChange={setView}
            items={tabItems}
            listClassName="justify-center"
          />
        </div>
        <div className="md:hidden">
          <EditorField label="Tab of the public index" htmlFor="index-layout-view">
            <EditorSelect
              id="index-layout-view"
              selectSize="sm"
              value={view}
              onChange={(event) => setView(event.target.value)}
              options={tabItems.map((item) => ({ value: item.id, label: item.label }))}
            />
          </EditorField>
        </div>

        <IndexLayoutBoard
          panels={panels}
          columnLayout={dataset === "psychoactive" && view === "all" ? SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT : undefined}
          actions={actions}
          sections={allSections}
          onDrop={handleDrop}
          resolveName={resolveName}
          emptyMessage={emptyView}
          tray={
            <UnplacedTray
              items={unplaced.publicGaps}
              hiddenItems={unplaced.hidden}
              onRequestMove={setMoveRequest}
              datasetLabel={DATASET_LABELS[dataset]}
            />
          }
        />

        <div
          role="region"
          aria-label="History"
          className="theme-portal-rule sticky bottom-0 z-20 -mx-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-[var(--editor-panel-bg)]/95 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4"
        >
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!history.canUndo}
              onClick={undo}
              aria-keyshortcuts="Meta+Z Control+Z"
              title={history.undoLabel ? `Undo: ${history.undoLabel}` : undefined}
            >
              <Icon icon="lucide:undo-2" size={14} />
              Undo
              <span aria-hidden className="[@media(pointer:coarse)]:hidden">
                <kbd className="theme-dev-kbd opacity-70">{undoKey}</kbd>
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!history.canRedo}
              onClick={redo}
              aria-keyshortcuts="Shift+Meta+Z Shift+Control+Z"
              title={history.redoLabel ? `Redo: ${history.redoLabel}` : undefined}
            >
              <Icon icon="lucide:redo-2" size={14} />
              Redo
              <span aria-hidden className="hidden [@media(pointer:fine)]:lg:inline">
                <kbd className="theme-dev-kbd opacity-70">{redoKey}</kbd>
              </span>
            </Button>
          </div>
          <p aria-live="polite" className="theme-text-muted order-last w-full min-w-0 text-sm sm:order-none sm:w-auto sm:flex-1">
            {lastChange ?? (history.undoLabel ? `Last change: ${history.undoLabel}.` : "No changes yet in this session.")}
          </p>
          {commit && commit.hasPendingChanges ? (
            <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={reviewAndCommit}>
              <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
              Review and commit
            </Button>
          ) : null}
        </div>
      </div>

      <LayoutMoveDialog
        request={moveRequest}
        destinations={destinations}
        holds={slotHolds}
        onClose={() => setMoveRequest(null)}
        onMove={(request, to) => {
          setMoveRequest(null);
          actions.onMove(request.from, request.slug, to);
          setPendingFocus(rowId(to, slugify(request.slug) || request.slug));
        }}
        onCloseAutoFocus={(event) => {
          if (pendingFocus) event.preventDefault();
        }}
      />
    </div>
  );
}

