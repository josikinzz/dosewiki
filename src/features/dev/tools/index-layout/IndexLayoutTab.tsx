import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDevMode } from "../../context/DevModeContext";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { DatasetTabs } from "./DatasetTabs";
import { IndexLayoutColumns } from "./IndexLayoutColumns";
import { IndexLayoutJsonEditor } from "./IndexLayoutJsonEditor";
import { LayoutToolbar } from "./LayoutToolbar";
import { createLayoutDataHelpers } from "./layoutDataUtils";
import { useIndexLayoutCategoryController } from "./useIndexLayoutCategoryController";
import { useLayoutEditor } from "./useLayoutEditor";

import {
  type IndexLayoutTabProps,
  type ManualDatasetKey,
  type ManualIndexConfig,
} from "./types";

import {
  deepClone,
  areManualsEqual,
} from "./utils";

const MAX_COLUMNS = 6;

const DATASET_ORDER: ManualDatasetKey[] = ["psychoactive", "chemical", "mechanism"];


export function IndexLayoutTab({
  commitPanel,
}: IndexLayoutTabProps) {
  const [columnMode, setColumnMode] = useState<"auto" | 1 | 2 | 3 | 4 | 5 | 6>("auto");
  const autoColumnCount = useResponsiveColumnCount();
  const columnCount = columnMode === "auto" ? autoColumnCount : columnMode;

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

  const {
    sortSlugsWithCommonPriority,
    resolveSlugStatus,
    organizeManualEntries,
    normalizeManualOrdering,
  } = useMemo(() => {
    return createLayoutDataHelpers(allSubstanceRecords, allSubstancesBySlug);
  }, [allSubstanceRecords, allSubstancesBySlug]);

  const datasetOrder = DATASET_ORDER;

  interface DatasetDefinition {
    key: ManualDatasetKey;
    label: string;
    icon: IconName;
    description: string;
    helperLabel: string;
    helperDetail: string;
    manual: ManualIndexConfig;
    replaceManual: (next: ManualIndexConfig) => void;
    resetContextManual: () => void;
    getOriginalManual: () => ManualIndexConfig;
  }

  const datasetDefinitions = useMemo<Record<ManualDatasetKey, DatasetDefinition>>(
    () => ({
      psychoactive: {
        key: "psychoactive",
        label: "Psychoactive class",
        icon: "fluent:brain-circuit-28-filled",
        description: "Curate the manual layout for psychoactive classifications used on the substance index.",
        helperLabel: "Psychoactive class manual",
        helperDetail: "Controls the category, section, and ordering for the public Psychoactive class tab.",
        manual: psychoactiveIndexManual,
        replaceManual: replacePsychoactiveIndexManual,
        resetContextManual: resetPsychoactiveIndexManual,
        getOriginalManual: getOriginalPsychoactiveIndexManual,
      },
      chemical: {
        key: "chemical",
        label: "Chemical class",
        icon: "solar:benzene-ring-linear",
        description: "Compose the curated chemical class ordering for the substance index.",
        helperLabel: "Chemical class manual",
        helperDetail: "Feeds the Chemical class tab and Dev Tools previews when editing articles.",
        manual: chemicalIndexManual,
        replaceManual: replaceChemicalIndexManual,
        resetContextManual: resetChemicalIndexManual,
        getOriginalManual: getOriginalChemicalIndexManual,
      },
      mechanism: {
        key: "mechanism",
        label: "Mechanism of action",
        icon: "fa-solid:cogs",
        description: "Manage the mechanism of action taxonomy used across the index.",
        helperLabel: "Mechanism manual",
        helperDetail: "Controls the Mechanism of action tab layout plus related detail page ordering.",
        manual: mechanismIndexManual,
        replaceManual: replaceMechanismIndexManual,
        resetContextManual: resetMechanismIndexManual,
        getOriginalManual: getOriginalMechanismIndexManual,
      },
    }), [
      chemicalIndexManual,
      getOriginalChemicalIndexManual,
      getOriginalMechanismIndexManual,
      getOriginalPsychoactiveIndexManual,
      mechanismIndexManual,
      psychoactiveIndexManual,
      replaceChemicalIndexManual,
      replaceMechanismIndexManual,
      replacePsychoactiveIndexManual,
      resetChemicalIndexManual,
      resetMechanismIndexManual,
      resetPsychoactiveIndexManual,
    ],
  );

  const [activeDataset, setActiveDataset] = useState<ManualDatasetKey>("psychoactive");
  const [showJsonEditor, setShowJsonEditor] = useState(false);
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
    organizeEntries,
    setSaveNotice,
  } = useLayoutEditor({
    datasetOrder,
    datasetDefinitions,
    normalizeManualOrdering,
    organizeManualEntries,
    deepClone,
    areManualsEqual,
  });

  const activeDefinition = datasetDefinitions[activeDataset];
  const { normalizedCurrentManuals, draftManuals, rawJsonDrafts, jsonErrors, saveNotice } = state;
  const normalizedCurrentManual = normalizedCurrentManuals[activeDataset];
  const draftManual = draftManuals[activeDataset];
  const rawJsonDraft = rawJsonDrafts[activeDataset];
  const jsonError = jsonErrors[activeDataset];

  useEffect(() => {
    setSaveNotice(null);
  }, [activeDataset]);

  const hasUnsavedChanges = useMemo(
    () => !areManualsEqual(normalizedCurrentManual, draftManual),
    [draftManual, normalizedCurrentManual],
  );

  const updateDraftManualForActive = useCallback(
    (updater: (manual: ManualIndexConfig) => ManualIndexConfig) => {
      updateDraftManualForDataset(activeDataset, updater);
    },
    [activeDataset, updateDraftManualForDataset],
  );

  const {
    substanceOptions,
    datasetSlugSet,
    columnGroups,
    handleDragEnd,
    updateCategory,
    removeCategory,
    moveCategory,
    addCategory,
    addSection,
    setColumn,
  } = useIndexLayoutCategoryController({
    allSubstanceRecords,
    draftManual,
    columnCount,
    updateDraftManualForActive,
  });

  const handleApplyJson = useCallback(() => {
    try {
      applyJsonForDataset(activeDataset, rawJsonDraft);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse JSON";
      setJsonErrorForDataset(activeDataset, reason);
    }
  }, [activeDataset, applyJsonForDataset, rawJsonDraft, setJsonErrorForDataset]);

  const handleSave = useCallback(() => {
    saveDataset(activeDataset);
  }, [activeDataset, saveDataset]);

  const handleResetDraft = useCallback(() => {
    resetDraft(activeDataset);
  }, [activeDataset, resetDraft]);

  const handleResetToOriginal = useCallback(() => {
    resetToOriginal(activeDataset);
  }, [activeDataset, resetToOriginal]);

  const handleOrganizeEntries = useCallback(() => {
    organizeEntries(activeDataset);
  }, [activeDataset, organizeEntries]);

  return (
    <div className="space-y-6">
      {commitPanel ? <div>{commitPanel}</div> : null}
      <DatasetTabs
        datasets={datasetOrder.map((datasetKey) => ({
          key: datasetKey,
          label: datasetDefinitions[datasetKey].label,
          icon: datasetDefinitions[datasetKey].icon,
        }))}
        activeKey={activeDataset}
        onChange={(key) => setActiveDataset(key as ManualDatasetKey)}
      />
      <LayoutToolbar
        hasUnsavedChanges={hasUnsavedChanges}
        saveNotice={saveNotice}
        showJsonEditor={showJsonEditor}
        onSave={handleSave}
        onOrganize={handleOrganizeEntries}
        onReset={handleResetDraft}
        onRestore={handleResetToOriginal}
        onToggleJson={() => setShowJsonEditor((previous) => !previous)}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
        <label className="text-[11px] uppercase tracking-[0.3em] text-white/40" htmlFor="layout-column-mode">
          Columns
        </label>
        <Select
          value={String(columnMode)}
          onValueChange={(value) => {
            if (value === "auto") {
              setColumnMode("auto");
              return;
            }
            const next = Number(value);
            if (next >= 1 && next <= MAX_COLUMNS) {
              setColumnMode(next as 1 | 2 | 3 | 4 | 5 | 6);
            }
          }}
        >
          <SelectTrigger id="layout-column-mode" selectSize="compact" className="w-auto min-w-[9rem] bg-[color-mix(in_srgb,#020617_80%,var(--theme-control-base))]">
            <SelectValue placeholder="Auto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="1">1 column</SelectItem>
            <SelectItem value="2">2 columns</SelectItem>
            <SelectItem value="3">3 columns</SelectItem>
            <SelectItem value="4">4 columns</SelectItem>
            <SelectItem value="5">5 columns</SelectItem>
            <SelectItem value="6">6 columns</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {jsonError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-[color-mix(in_srgb,#f43f5e_10%,var(--theme-body-bg))] p-3 text-sm text-rose-100">
          <Icon icon="lucide:alert-circle" className="h-4 w-4" size={16} />
          <span>{jsonError}</span>
        </div>
      )}

      {showJsonEditor ? (
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
        <IndexLayoutColumns
          columnCount={columnCount}
          columnGroups={columnGroups}
          draftCategoryTotal={draftManual.categories.length}
          maxColumns={MAX_COLUMNS}
          handleDragEnd={handleDragEnd}
          updateCategory={updateCategory}
          removeCategory={removeCategory}
          moveCategory={moveCategory}
          setColumn={setColumn}
          addSection={addSection}
          addCategory={addCategory}
          substanceOptions={substanceOptions}
          datasetSlugSet={datasetSlugSet}
          sortSlugsWithCommonPriority={sortSlugsWithCommonPriority}
          resolveSlugStatus={resolveSlugStatus}
        />
      )}
    </div>
  );
}
