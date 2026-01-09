import type { TagOption } from "../../../data/config/tagOptions";
import type { ArticleDraftFormController } from "../../../hooks/useArticleDraftForm";
import type {
  ArticleDraftForm,
  DoseRangeForm,
  DurationStagesForm,
  ToleranceForm,
} from "../../../utils/forms/articleDraftForm";

export type { ArticleDraftForm, DoseRangeForm, DurationStagesForm, ToleranceForm };
export type { ArticleDraftFormController };
export type { TagOption };

export type ArticleDraftFormFieldsProps = {
  idPrefix: string;
  controller: ArticleDraftFormController;
};

export type OverviewFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleTagFieldChange: ArticleDraftFormController["handleTagFieldChange"];
  replaceForm: ArticleDraftFormController["replaceForm"];
  categoryOptions: TagOption[];
  indexCategoryOptions: TagOption[];
};

export type DosageDurationFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleRouteFieldChange: ArticleDraftFormController["handleRouteFieldChange"];
  handleDoseRangeFieldChange: ArticleDraftFormController["handleDoseRangeFieldChange"];
  handleDurationRouteStageChange: ArticleDraftFormController["handleDurationRouteStageChange"];
  addRouteEntry: ArticleDraftFormController["addRouteEntry"];
  removeRouteEntry: ArticleDraftFormController["removeRouteEntry"];
  applyDurationFromRoute: ArticleDraftFormController["applyDurationFromRoute"];
};

export type ChemistryFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleTagFieldChange: ArticleDraftFormController["handleTagFieldChange"];
  chemicalClassOptions: TagOption[];
  psychoactiveClassOptions: TagOption[];
  mechanismOptions: TagOption[];
};

export type SubjectiveEffectsFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleTagFieldChange: ArticleDraftFormController["handleTagFieldChange"];
};

export type AddictionFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

export type InteractionsFieldsProps = {
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleTagFieldChange: ArticleDraftFormController["handleTagFieldChange"];
};

export type ToleranceFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleToleranceFieldChange: ArticleDraftFormController["handleToleranceFieldChange"];
  handleToleranceCrossToleranceChange: ArticleDraftFormController["handleToleranceCrossToleranceChange"];
};

export type NotesFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

export type CitationsFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleCitationFieldChange: ArticleDraftFormController["handleCitationFieldChange"];
  addCitationEntry: ArticleDraftFormController["addCitationEntry"];
  removeCitationEntry: ArticleDraftFormController["removeCitationEntry"];
};

// Label arrays for form fields
export const doseRangeLabels: Array<[keyof DoseRangeForm, string]> = [
  ["threshold", "Threshold"],
  ["light", "Light"],
  ["moderate", "Moderate"],
  ["strong", "Strong"],
  ["heavy", "Heavy"],
];

export const durationStageLabels: Array<[keyof DurationStagesForm, string, string]> = [
  ["totalDuration", "Total Duration", "e.g., 6-8 hours"],
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["comeUp", "Come-up", "e.g., 30-60 minutes"],
  ["peak", "Peak", "e.g., 2-3 hours"],
  ["offset", "Offset", "e.g., ~2 hours"],
  ["afterEffects", "After Effects", "e.g., Residual stimulation"],
];

export const toleranceLabels: Array<[keyof Omit<ToleranceForm, "crossTolerance">, string]> = [
  ["fullTolerance", "Full Tolerance"],
  ["halfTolerance", "Half Tolerance"],
  ["baselineTolerance", "Baseline Reset"],
];
