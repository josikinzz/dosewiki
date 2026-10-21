"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorReadState } from "@/hooks/useEditorRead";
import { isTextEntryTarget, useConfirm, useDevShortcuts, useScrollToDetail } from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";
import { useOcl } from "./useOcl";
import { useRdkit } from "./useRdkit";
import { CLASS_STRUCTURES } from "./classStructures";
import { CLASS_TEMPLATE_OPTIONS } from "./classTemplateOptions";
import {
  buildSubstancePickerItems,
  type MoleculePickerItem,
} from "./moleculePickerOrdering";
import { useMoleculePickerReadState } from "./useMoleculePickerRead";
import {
  isEditorMode,
  moleculeEditorSlug,
  parseMoleculeEditorSlug,
  type MoleculeEditorSelection,
} from "./moleculeEditorRoute";
import { MoleculeEditorSession } from "./MoleculeEditorSession";
import { readMoleculeTemplateList } from "./moleculeEditorRequests";
import { MoleculeListColumn } from "./MoleculeListColumn";
import type { MoleculePaneRecord } from "./MoleculeEditorWorkbench";
import {
  depictionStateOf,
  type MoleculeListFilter,
  type MoleculeListRow,
  type OverrideSummary,
} from "./moleculeListModel";
import type { EditorMode } from "./moleculeEditorTypes";

const LOAD_TIMEOUT_MS = 8000;

const LIST_SHORTCUTS = [{ keys: "/", label: "Find a structure in the list" }] as const;

function psychoactiveClasses(classification: unknown): string[] {
  if (!classification || typeof classification !== "object" || !("psychoactive_class" in classification)) {
    return [];
  }
  return Array.isArray(classification.psychoactive_class)
    ? classification.psychoactive_class.filter((value): value is string => typeof value === "string")
    : [];
}

export function MoleculeEditorTab({ initialSlug }: { initialSlug?: string } = {}) {
  const [selection, setSelection] = useState<MoleculeEditorSelection>(() =>
    parseMoleculeEditorSlug(initialSlug),
  );
  const { mode, selected } = selection;
  const [fineRotation, setFineRotation] = useState(true);
  const enginesEnabled = selected !== null;
  const { ocl, error: oclError } = useOcl(enginesEnabled);
  const { rdkit, error: rdkitError } = useRdkit(enginesEnabled);

  const urlSlugRef = useRef(initialSlug);
  useEffect(() => {
    const slug = moleculeEditorSlug(selection);
    if (slug === urlSlugRef.current) return;
    urlSlugRef.current = slug;
    window.history.replaceState(window.history.state, "", viewToPath({ type: "dev", tab: "molecule-editor", slug }));
  }, [selection]);

  const sessionDirtyRef = useRef(false);
  const [sessionDirty, setSessionDirty] = useState(false);
  const onSessionDirtyChange = useCallback((dirty: boolean) => {
    sessionDirtyRef.current = dirty;
    setSessionDirty(dirty);
  }, []);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const paneTitleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusPaneOnOpen = useRef(false);

  const switchTo = useCallback(
    (next: MoleculeEditorSelection, description: string) => {
      const run = () => {
        focusPaneOnOpen.current = next.selected !== null;
        setSelection(next);
      };
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
      if (slug === selected) {
        paneTitleRef.current?.focus();
        return;
      }
      switchTo(
        { mode, selected: slug },
        mode === "substances"
          ? "Switching to another substance will discard the unsaved changes to this depiction."
          : "Switching to another class will discard the unsaved changes to this depiction.",
      );
    },
    [mode, selected, switchTo],
  );
  const onClose = useCallback(() => {
    switchTo({ mode, selected: null }, "Closing this structure will discard the unsaved changes to its depiction.");
  }, [mode, switchTo]);

  const [filters, setFilters] = useState<Record<EditorMode, MoleculeListFilter>>({ substances: "all", classes: "all", templates: "all" });
  const [queries, setQueries] = useState<Record<EditorMode, string>>({ substances: "", classes: "", templates: "" });
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

  const [templateSummaries, setTemplateSummaries] = useState<Map<string, OverrideSummary> | null>(null);
  const [templateListError, setTemplateListError] = useState<string | null>(null);
  const [templateReload, setTemplateReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setTemplateListError(null);
    void readMoleculeTemplateList()
      .then((templates) => {
        if (!cancelled) {
          setTemplateSummaries(new Map(templates.map((row) => [row.classKey, { source: "saved", updatedAt: row.updatedAt }])));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setTemplateListError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [templateReload]);
  const templateKeys = useMemo(() => Array.from(templateSummaries?.keys() ?? []), [templateSummaries]);

  const pickerRead = useMoleculePickerReadState(true);
  const pickerRows = pickerRead.data;
  const overrideListRead = useEditorReadState("moleculeOverrides:listSlugs", {}, "list");
  const overrideList = overrideListRead.data;
  const overrideSummaries = useMemo(() => {
    const map = new Map<string, OverrideSummary>();
    for (const row of (overrideList ?? []) as Array<{ slug: string; source?: string; updatedAt?: string | number }>) {
      map.set(row.slug, { source: row.source ?? null, updatedAt: row.updatedAt ?? null });
    }
    return map;
  }, [overrideList]);
  const overrideSet = useMemo(
    () => new Set([
      ...overrideSummaries.keys(),
      ...(pickerRows ?? []).filter((row) => row.hasOverride).map((row) => row.slug),
    ]),
    [overrideSummaries, pickerRows],
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
        hasOverride: templateKeys.includes(item.key),
      })),
    [templateKeys],
  );
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

  const rows = useMemo<MoleculeListRow[] | null>(() => {
    if (mode === "substances") {
      if (!molecules) return null;
      return molecules.map((item) => {
        const summary = overrideSummaries.get(item.slug);
        return { ...item, depiction: depictionStateOf(summary, item.hasOverride), updatedAt: summary?.updatedAt ?? null };
      });
    }
    if (mode === "classes") {
      return classStructures.map((item) => {
        const summary = overrideSummaries.get(`class:${item.slug}`);
        return { ...item, depiction: summary ? "editor" : depictionStateOf(undefined, item.hasOverride), updatedAt: summary?.updatedAt ?? null };
      });
    }
    if (!templateSummaries && !templateListError) return null;
    return classTemplates.map((item) => {
      const summary = templateSummaries?.get(item.slug);
      return { ...item, depiction: summary ? "saved" : "none", updatedAt: summary?.updatedAt ?? null };
    });
  }, [mode, molecules, overrideSummaries, classStructures, classTemplates, templateSummaries, templateListError]);
  const listError =
    mode === "substances" ? pickerRead.error : mode === "templates" ? (templateSummaries ? null : templateListError) : null;
  const retryList = useCallback(() => {
    pickerRead.retry();
    overrideListRead.retry();
    setTemplateReload((key) => key + 1);
  }, [pickerRead, overrideListRead]);

  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (rows) {
      setLoadTimedOut(false);
      return;
    }
    const id = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [rows]);

  const listRecord = useMemo<MoleculePaneRecord | null>(() => {
    const row = rows?.find((item) => item.slug === selected);
    return row
      ? { title: row.title, slug: row.slug, depiction: row.depiction, savedAt: row.updatedAt ?? null, publiclyListed: row.publiclyListed }
      : null;
  }, [rows, selected]);

  useScrollToDetail(paneRef, selected ? `${mode}:${selected}` : null);
  useEffect(() => {
    if (!selected || !focusPaneOnOpen.current) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [selected, mode]);
  const deepLinked = useRef(selection.selected);
  useEffect(() => {
    if (!deepLinked.current || !rows) return;
    deepLinked.current = null;
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023.98px)").matches) {
      paneRef.current?.scrollIntoView({ block: "start" });
    }
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [rows]);
  const onBackToList = useCallback(() => {
    listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    const open = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    (open ?? searchRef.current)?.focus({ preventScroll: true });
  }, []);

  useDevShortcuts(LIST_SHORTCUTS);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const modeCounts: Record<EditorMode, number | null> = {
    substances: molecules?.length ?? null,
    classes: CLASS_STRUCTURES.length,
    templates: CLASS_TEMPLATE_OPTIONS.length,
  };

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <DevToolSection
        tool="molecule-editor"
        description="How each structure is drawn: atom positions, wedge and hash bonds, bold bonds. Substance and class depictions go live when you save; class templates stay private."
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <MoleculeListColumn
            ref={listRef}
            mode={mode}
            onModeChange={onModeChange}
            modeCounts={modeCounts}
            rows={rows}
            error={listError}
            onRetry={retryList}
            loadTimedOut={loadTimedOut}
            selected={selected}
            dirty={sessionDirty}
            onSelect={onSelect}
            filter={filters[mode]}
            onFilterChange={(filter) => setFilters((current) => ({ ...current, [mode]: filter }))}
            query={queries[mode]}
            onQueryChange={(query) => setQueries((current) => ({ ...current, [mode]: query }))}
            searchRef={searchRef}
          />
          <div ref={paneRef} className="min-w-0 scroll-mt-24">
            <MoleculeEditorSession
              key={`${mode}:${selected ?? ""}`}
              mode={mode}
              selected={selected}
              listRecord={listRecord}
              listLoading={!rows && !listError}
              onClose={onClose}
              onBackToList={onBackToList}
              titleRef={paneTitleRef}
              onDirtyChange={onSessionDirtyChange}
              engines={{ ocl, oclError, rdkit, rdkitError }}
              fineRotation={fineRotation}
              onFineRotationChange={setFineRotation}
              loadTimedOut={loadTimedOut}
              molecules={molecules}
              classTemplates={classTemplates}
              importableMolecules={importableMolecules}
              overrideSet={overrideSet}
            />
          </div>
        </div>
      </DevToolSection>
      {confirmDialog}
    </div>
  );
}
