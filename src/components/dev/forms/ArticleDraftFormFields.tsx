import { useDevTagOptions } from "../../../hooks/useDevTagOptions";

import { OverviewFields } from "./OverviewFields";
import { DosageDurationFields } from "./DosageDurationFields";
import { ChemistryFields } from "./ChemistryFields";
import {
  SubjectiveEffectsFields,
  AddictionFields,
  InteractionsFields,
  ToleranceFields,
  NotesFields,
} from "./ContentFields";
import { CitationsFields } from "./CitationsFields";
import type { ArticleDraftFormFieldsProps } from "./types";

export function ArticleDraftFormFields({ idPrefix, controller }: ArticleDraftFormFieldsProps) {
  const {
    form,
    handleFieldChange,
    handleTagFieldChange,
    handleDurationFieldChange,
    handleDurationRouteStageChange,
    handleToleranceFieldChange,
    handleRouteFieldChange,
    handleDoseRangeFieldChange,
    addRouteEntry,
    removeRouteEntry,
    applyDurationDefaultsToRoute,
    handleCitationFieldChange,
    addCitationEntry,
    removeCitationEntry,
    replaceForm,
  } = controller;

  const {
    categories: categoryOptions,
    chemicalClasses: chemicalClassOptions,
    psychoactiveClasses: psychoactiveClassOptions,
    mechanismEntries: mechanismOptions,
    indexCategories: indexCategoryOptions,
  } = useDevTagOptions();

  return (
    <div className="space-y-12">
      <OverviewFields
        idPrefix={idPrefix}
        form={form}
        handleFieldChange={handleFieldChange}
        handleTagFieldChange={handleTagFieldChange}
        replaceForm={replaceForm}
        categoryOptions={categoryOptions}
        indexCategoryOptions={indexCategoryOptions}
      />
      <DosageDurationFields
        idPrefix={idPrefix}
        form={form}
        handleRouteFieldChange={handleRouteFieldChange}
        handleDoseRangeFieldChange={handleDoseRangeFieldChange}
        handleDurationFieldChange={handleDurationFieldChange}
        handleDurationRouteStageChange={handleDurationRouteStageChange}
        addRouteEntry={addRouteEntry}
        removeRouteEntry={removeRouteEntry}
        applyDurationDefaultsToRoute={applyDurationDefaultsToRoute}
      />
      <ChemistryFields
        idPrefix={idPrefix}
        form={form}
        handleFieldChange={handleFieldChange}
        handleTagFieldChange={handleTagFieldChange}
        chemicalClassOptions={chemicalClassOptions}
        psychoactiveClassOptions={psychoactiveClassOptions}
        mechanismOptions={mechanismOptions}
      />
      <AddictionFields idPrefix={idPrefix} form={form} handleFieldChange={handleFieldChange} />
      <SubjectiveEffectsFields idPrefix={idPrefix} form={form} handleFieldChange={handleFieldChange} />
      <InteractionsFields form={form} handleFieldChange={handleFieldChange} />
      <ToleranceFields
        idPrefix={idPrefix}
        form={form}
        handleFieldChange={handleFieldChange}
        handleToleranceFieldChange={handleToleranceFieldChange}
      />
      <NotesFields idPrefix={idPrefix} form={form} handleFieldChange={handleFieldChange} />
      <CitationsFields
        idPrefix={idPrefix}
        form={form}
        handleCitationFieldChange={handleCitationFieldChange}
        addCitationEntry={addCitationEntry}
        removeCitationEntry={removeCitationEntry}
      />
    </div>
  );
}
