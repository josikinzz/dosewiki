import type { TagOption } from "../../../data/config/tagOptions";
import type { ArticleDraftFormController } from "../../../hooks/useArticleDraftForm";
import type {
  ArticleDraftForm,
  DoseRangeForm,
  DurationForm,
  DurationStagePayload,
  ToleranceForm,
} from "../../../utils/forms/articleDraftForm";

export type { ArticleDraftForm, DoseRangeForm, DurationForm, DurationStagePayload, ToleranceForm };
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
  handleDurationFieldChange: ArticleDraftFormController["handleDurationFieldChange"];
  handleDurationRouteStageChange: ArticleDraftFormController["handleDurationRouteStageChange"];
  addRouteEntry: ArticleDraftFormController["addRouteEntry"];
  removeRouteEntry: ArticleDraftFormController["removeRouteEntry"];
  applyDurationDefaultsToRoute: ArticleDraftFormController["applyDurationDefaultsToRoute"];
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
};

export type AddictionFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

export type InteractionsFieldsProps = {
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

export type ToleranceFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleToleranceFieldChange: ArticleDraftFormController["handleToleranceFieldChange"];
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

export const durationLabels: Array<[keyof DurationForm, string, string]> = [
  ["totalDuration", "Total", "e.g., 6-8 hours"],
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["comeUp", "Come-up", "e.g., 30-60 minutes"],
  ["peak", "Peak", "e.g., 2-3 hours"],
  ["offset", "Offset", "e.g., ~2 hours"],
  ["afterEffects", "After effects", "e.g., Residual stimulation"],
];

export const routeDurationLabels: Array<[keyof DurationStagePayload, string, string]> = [
  ["total_duration", "Total", "e.g., 6-8 hours"],
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["come_up", "Come-up", "e.g., 30-60 minutes"],
  ["peak", "Peak", "e.g., 2-3 hours"],
  ["offset", "Offset", "e.g., ~2 hours"],
  ["after_effects", "After effects", "e.g., Residual stimulation"],
];

export const toleranceLabels: Array<[keyof ToleranceForm, string]> = [
  ["fullTolerance", "Full tolerance"],
  ["halfTolerance", "Half tolerance"],
  ["zeroTolerance", "Baseline reset"],
];
