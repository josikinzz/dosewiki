import type { ChangeEvent } from "react";

import type { TagOption } from "../../data/tagOptions";
import type { ArticleDraftFormController } from "../../hooks/useArticleDraftForm";
import type {
  ArticleDraftForm,
  DoseRangeForm,
  DurationForm,
  DurationStagePayload,
  ToleranceForm,
} from "../../utils/articleDraftForm";
import { parseListInput } from "../../utils/articleDraftForm";

import { useDevTagOptions } from "../../hooks/useDevTagOptions";
import { TagMultiSelect } from "../common/TagMultiSelect";

const baseInputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[16px] text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30 md:text-sm";
const baseTextareaClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-[16px] text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30 md:text-sm";
const labelClass = "mb-2 block text-xs font-medium uppercase tracking-wide text-white/50";
const helperTextClass = "text-[11px] text-white/45";

const doseRangeLabels: Array<[keyof DoseRangeForm, string]> = [
  ["threshold", "Threshold"],
  ["light", "Light"],
  ["common", "Common"],
  ["strong", "Strong"],
  ["heavy", "Heavy"],
];

const durationLabels: Array<[keyof DurationForm, string, string]> = [
  ["totalDuration", "Total duration", "e.g., 6-8 hours"],
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["peak", "Peak", "e.g., 2-3 hours"],
  ["offset", "Offset", "e.g., ~2 hours"],
  ["afterEffects", "After effects", "e.g., Residual stimulation"],
];

const routeDurationLabels: Array<[keyof DurationStagePayload, string, string]> = [
  ["total_duration", "Total duration", "e.g., 6-8 hours"],
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["peak", "Peak", "e.g., 2-3 hours"],
  ["offset", "Offset", "e.g., ~2 hours"],
  ["after_effects", "After effects", "e.g., Residual stimulation"],
];

const toleranceLabels: Array<[keyof ToleranceForm, string]> = [
  ["fullTolerance", "Full tolerance"],
  ["halfTolerance", "Half tolerance"],
  ["zeroTolerance", "Baseline reset"],
];

type ArticleDraftFormFieldsProps = {
  idPrefix: string;
  controller: ArticleDraftFormController;
};

type SectionHeaderProps = {
  title: string;
  description?: string;
};

type CharacterCountProps = {
  value: string;
};

type ListPreviewProps = {
  items: string[];
  emptyLabel: string;
};

type OverviewFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleTagFieldChange: ArticleDraftFormController["handleTagFieldChange"];
  replaceForm: ArticleDraftFormController["replaceForm"];
  categoryOptions: TagOption[];
  indexCategoryOptions: TagOption[];
};

type DosageDurationFieldsProps = {
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

type ChemistryFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleTagFieldChange: ArticleDraftFormController["handleTagFieldChange"];
  chemicalClassOptions: TagOption[];
  psychoactiveClassOptions: TagOption[];
  mechanismOptions: TagOption[];
};

type SubjectiveEffectsFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

type AddictionFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

type InteractionsFieldsProps = {
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

type ToleranceFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
  handleToleranceFieldChange: ArticleDraftFormController["handleToleranceFieldChange"];
};

type NotesFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleFieldChange: ArticleDraftFormController["handleFieldChange"];
};

type CitationsFieldsProps = {
  idPrefix: string;
  form: ArticleDraftForm;
  handleCitationFieldChange: ArticleDraftFormController["handleCitationFieldChange"];
  addCitationEntry: ArticleDraftFormController["addCitationEntry"];
  removeCitationEntry: ArticleDraftFormController["removeCitationEntry"];
};

const SectionHeader = ({ title, description }: SectionHeaderProps) => (
  <div className="space-y-1">
    <h2 className="text-lg font-semibold text-fuchsia-200">{title}</h2>
    {description ? <p className="text-sm text-white/60">{description}</p> : null}
  </div>
);

const CharacterCount = ({ value }: CharacterCountProps) => (
  <p className="text-[11px] text-right text-white/40">{value.length} characters</p>
);

const ListPreview = ({ items, emptyLabel }: ListPreviewProps) => {
  if (items.length === 0) {
    return <p className={helperTextClass}>{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-white/70"
        >
          {item}
        </span>
      ))}
    </div>
  );
};

const OverviewFields = ({
  idPrefix,
  form,
  handleFieldChange,
  handleTagFieldChange,
  replaceForm,
  categoryOptions,
  indexCategoryOptions,
}: OverviewFieldsProps) => {
  const categoryPreview = form.categories;
  const displayNameTitleValue = form.drugName ?? form.title ?? "";
  const handleCategoriesChange = handleTagFieldChange("categories");
  const handleIndexCategoryChange = handleTagFieldChange("indexCategoryTags");

  const handleDisplayTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    replaceForm(
      {
        ...form,
        title: nextValue,
        drugName: nextValue,
      },
      { emitMutate: true },
    );
  };

  return (
    <section className="space-y-6">
      <SectionHeader title="Overview" description="Controls the hero title, alias rail, and index metadata." />
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-display-title`}>
          Display name / Title
        </label>
        <input
          id={`${idPrefix}-display-title`}
          className={baseInputClass}
          value={displayNameTitleValue}
          onChange={handleDisplayTitleChange}
          placeholder="Primary article title"
        />
        <p className={helperTextClass}>
          Keeps the hero heading and display name badge in sync.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-id`}>
            Article ID
          </label>
          <input
            id={`${idPrefix}-id`}
            className={baseInputClass}
            value={form.id}
            onChange={handleFieldChange("id")}
            placeholder="e.g., 101"
          />
          <p className={helperTextClass}>
            Leave blank to auto-assign the next available ID when staging a new article.
          </p>
        </div>
        <div>
          <TagMultiSelect
            label="Index tags"
            helperText="Use the + button to pick existing index tags or type to add new ones. Values export as a semicolon-separated list."
            placeholder="Filter or create index tags"
            value={form.indexCategoryTags}
            onChange={handleIndexCategoryChange}
            options={indexCategoryOptions}
            addButtonLabel="Add index tag"
            openStrategy="button"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-chemical-name`}>
            Chemical name
          </label>
          <input
            id={`${idPrefix}-chemical-name`}
            className={baseInputClass}
            value={form.chemicalName}
            onChange={handleFieldChange("chemicalName")}
            placeholder="Systematic or ISO name"
          />
        </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-alternative-name`}>
          Alternative name
        </label>
        <input
          id={`${idPrefix}-alternative-name`}
          className={baseInputClass}
          value={form.alternativeName}
          onChange={handleFieldChange("alternativeName")}
          placeholder="Common alias (optional)"
        />
        <p className={helperTextClass}>Use semicolons for multiple aliases to keep the hero rail tidy.</p>
      </div>
    </div>
    <div>
      <TagMultiSelect
        label="Categories"
        helperText="Use the + button to open the picker. Type only when creating or filtering categories."
        placeholder="Filter or create categories"
        value={form.categories}
        onChange={handleCategoriesChange}
        options={categoryOptions}
        addButtonLabel="Add category"
        openStrategy="button"
      />
      <ListPreview items={categoryPreview} emptyLabel="Badges preview appears once categories are added." />
    </div>
    </section>
  );
};

const DosageDurationFields = ({
  idPrefix,
  form,
  handleRouteFieldChange,
  handleDoseRangeFieldChange,
  handleDurationFieldChange,
  handleDurationRouteStageChange,
  addRouteEntry,
  removeRouteEntry,
  applyDurationDefaultsToRoute,
}: DosageDurationFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Dosage & Duration"
      description="Mirrors the live dosage card with route tables followed by metabolism timing."
    />
    <div className="space-y-4">
      {form.routes.map((route, index) => {
        const routeKey = `${idPrefix}-route-${index}`;
        const durationRoute = form.durationRoutes[index];
        return (
          <div key={routeKey} className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white/75">Route {index + 1}</p>
              {form.routes.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-white/60 transition hover:text-white"
                  onClick={() => removeRouteEntry(index)}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Administration route</label>
                <input
                  className={baseInputClass}
                  value={route.route}
                  onChange={handleRouteFieldChange(index, "route")}
                  placeholder="e.g., Oral"
                />
              </div>
              <div>
                <label className={labelClass}>Units</label>
                <input
                  className={baseInputClass}
                  value={route.units}
                  onChange={handleRouteFieldChange(index, "units")}
                  placeholder="e.g., µg"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {doseRangeLabels.map(([key, label]) => (
                <div key={`${routeKey}-${key}`}>
                  <label className={labelClass}>{label}</label>
                  <input
                    className={baseInputClass}
                    value={route.doseRanges[key]}
                    onChange={handleDoseRangeFieldChange(index, key)}
                    placeholder="e.g., 10-20 µg"
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {routeDurationLabels.map(([stageKey, label, placeholder]) => (
                <div key={`${routeKey}-duration-${stageKey}`}>
                  <label className={labelClass}>{label}</label>
                  <input
                    className={baseInputClass}
                    value={durationRoute?.stages?.[stageKey] ?? ""}
                    onChange={handleDurationRouteStageChange(index, stageKey)}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs text-white/60 transition hover:text-white"
                onClick={() => applyDurationDefaultsToRoute(index)}
              >
                Copy defaults
              </button>
            </div>
          </div>
        );
      })}
    </div>
    <button
      type="button"
      onClick={addRouteEntry}
      className="w-full rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
    >
      Add route
    </button>
    <p className={helperTextClass}>Separate ranges with hyphens; omit values when data is unavailable.</p>
    <div className="grid gap-4 md:grid-cols-2">
      {durationLabels.map(([key, label, placeholder]) => (
        <div key={`${idPrefix}-${key}`}>
          <label className={labelClass}>{label}</label>
          <input
            className={baseInputClass}
            value={form.duration[key]}
            onChange={handleDurationFieldChange(key)}
            placeholder={placeholder}
          />
        </div>
      ))}
    </div>
    <p className={helperTextClass}>Use these defaults to keep timing consistent—copy them into each route as needed with the per-route action above.</p>
  </section>
);

const ChemistryFields = ({
  idPrefix,
  form,
  handleFieldChange,
  handleTagFieldChange,
  chemicalClassOptions,
  psychoactiveClassOptions,
  mechanismOptions,
}: ChemistryFieldsProps) => {
  const handleChemicalClassChange = handleTagFieldChange("chemicalClasses");
  const handlePsychoactiveClassChange = handleTagFieldChange("psychoactiveClasses");
  const handleMechanismChange = handleTagFieldChange("mechanismEntries");

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Chemistry & Pharmacology"
        description="Feeds the Chemistry & Pharmacology card chips and mechanism copy."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <TagMultiSelect
          label="Chemical class"
          helperText="Use the + button to browse chemical classes. Type when filtering or adding a new descriptor."
          placeholder="Filter or create chemical classes"
          value={form.chemicalClasses}
          onChange={handleChemicalClassChange}
          options={chemicalClassOptions}
          addButtonLabel="Add chemical class"
          openStrategy="button"
        />
        <TagMultiSelect
          label="Psychoactive class"
          helperText="Tap the + button to open the picker. Type to filter or capture a brand-new psychoactive class."
          placeholder="Filter or create psychoactive classes"
          value={form.psychoactiveClasses}
          onChange={handlePsychoactiveClassChange}
          options={psychoactiveClassOptions}
          addButtonLabel="Add psychoactive class"
          openStrategy="button"
        />
    </div>
    <div className="space-y-2">
      <TagMultiSelect
        label="Mechanism of action"
        helperText="Use the + button to pick existing targets. Type only when filtering or defining a new mechanism."
        placeholder="Filter or create mechanisms"
        value={form.mechanismEntries}
        onChange={handleMechanismChange}
        options={mechanismOptions}
        addButtonLabel="Add mechanism of action"
        openStrategy="button"
      />
        <CharacterCount value={form.mechanismOfAction} />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-half-life`}>
          Half-life (optional)
        </label>
        <input
          id={`${idPrefix}-half-life`}
          className={baseInputClass}
          value={form.halfLife}
          onChange={handleFieldChange("halfLife")}
          placeholder="e.g., ~3.6 hours"
        />
        <p className={helperTextClass}>Shown in the Chemistry & Pharmacology card under kinetics.</p>
      </div>
    </section>
  );
};

const SubjectiveEffectsFields = ({ idPrefix, form, handleFieldChange }: SubjectiveEffectsFieldsProps) => {
  const effectPreview = parseListInput(form.subjectiveEffectsInput);

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Subjective Effects"
        description="Powers the badge cloud on the Substance page."
      />
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-subjective-effects`}>
          Subjective effects
        </label>
        <textarea
          id={`${idPrefix}-subjective-effects`}
          className={`${baseTextareaClass} min-h-[100px]`}
          value={form.subjectiveEffectsInput}
          onChange={handleFieldChange("subjectiveEffectsInput")}
          placeholder="Euphoria\nTime dilation"
        />
        <p className={helperTextClass}>List one effect per line; alphabetise when possible for scanability.</p>
        <ListPreview items={effectPreview} emptyLabel="Effects preview populates when entries are added." />
      </div>
    </section>
  );
};

const AddictionFields = ({ idPrefix, form, handleFieldChange }: AddictionFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Addiction Potential"
      description="Surfaces as the dedicated Addiction Potential card."
    />
    <div>
      <label className={labelClass} htmlFor={`${idPrefix}-addiction-potential`}>
        Addiction potential summary
      </label>
      <textarea
        id={`${idPrefix}-addiction-potential`}
        className={`${baseTextareaClass} min-h-[120px]`}
        value={form.addictionPotential}
        onChange={handleFieldChange("addictionPotential")}
        placeholder="Summarise dependence risk, compulsion, and mitigation guidance."
      />
      <CharacterCount value={form.addictionPotential} />
      <p className={helperTextClass}>Use short paragraphs focused on dependency risk and mitigation tips.</p>
    </div>
  </section>
);

const InteractionsFields = ({ form, handleFieldChange }: InteractionsFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Interactions"
      description="Match the live Interactions buckets: Dangerous, Unsafe, and Use with Caution."
    />
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className={labelClass}>Dangerous combinations</label>
        <textarea
          className={`${baseTextareaClass} min-h-[100px]`}
          value={form.interactionsDangerousInput}
          onChange={handleFieldChange("interactionsDangerousInput")}
          placeholder="MAOIs"
        />
      </div>
      <div>
        <label className={labelClass}>Unsafe combinations</label>
        <textarea
          className={`${baseTextareaClass} min-h-[100px]`}
          value={form.interactionsUnsafeInput}
          onChange={handleFieldChange("interactionsUnsafeInput")}
          placeholder="SSRIs"
        />
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Use with caution</label>
        <textarea
          className={`${baseTextareaClass} min-h-[100px]`}
          value={form.interactionsCautionInput}
          onChange={handleFieldChange("interactionsCautionInput")}
          placeholder="Alcohol"
        />
      </div>
    </div>
    <p className={helperTextClass}>Each line becomes an interaction chip with severity-colour styling.</p>
  </section>
);

const ToleranceFields = ({
  idPrefix,
  form,
  handleFieldChange,
  handleToleranceFieldChange,
}: ToleranceFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Tolerance"
      description="Feeds the Tolerance timeline card and cross-tolerance list."
    />
    <div className="grid gap-4 md:grid-cols-3">
      {toleranceLabels.map(([key, label]) => (
        <div key={`${idPrefix}-${key}`}>
          <label className={labelClass}>{label}</label>
          <input
            className={baseInputClass}
            value={form.tolerance[key]}
            onChange={handleToleranceFieldChange(key)}
            placeholder="e.g., ~3 days"
          />
        </div>
      ))}
    </div>
    <div>
      <label className={labelClass} htmlFor={`${idPrefix}-cross-tolerances`}>
        Cross tolerances
      </label>
      <textarea
        id={`${idPrefix}-cross-tolerances`}
        className={`${baseTextareaClass} min-h-[100px]`}
        value={form.crossTolerancesInput}
        onChange={handleFieldChange("crossTolerancesInput")}
        placeholder="Other arylcyclohexylamines"
      />
      <p className={helperTextClass}>One line per substance family; rendered beneath the timeline cards.</p>
    </div>
  </section>
);

const NotesFields = ({ idPrefix, form, handleFieldChange }: NotesFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Notes"
      description="Appears near the end of the article as Markdown-rendered advisory content."
    />
    <div>
      <label className={labelClass} htmlFor={`${idPrefix}-notes`}>
        Notes
      </label>
      <textarea
        id={`${idPrefix}-notes`}
        className={`${baseTextareaClass} min-h-[140px]`}
        value={form.notes}
        onChange={handleFieldChange("notes")}
        placeholder="Set & setting, harm reduction, and contextual insights."
      />
      <CharacterCount value={form.notes} />
      <p className={helperTextClass}>Supports Markdown basics (headings, emphasis, lists).</p>
    </div>
  </section>
);

const CitationsFields = ({
  idPrefix,
  form,
  handleCitationFieldChange,
  addCitationEntry,
  removeCitationEntry,
}: CitationsFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Citations"
      description="Powers the final citations list; keep order consistent with supporting notes."
    />
    <div className="space-y-4">
      {form.citations.map((citation, index) => {
        const citationKey = `${idPrefix}-citation-${index}`;
        return (
          <div key={citationKey} className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white/75">Citation {index + 1}</p>
              {form.citations.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-white/60 transition hover:text-white"
                  onClick={() => removeCitationEntry(index)}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Citation label</label>
                <input
                  className={baseInputClass}
                  value={citation.name}
                  onChange={handleCitationFieldChange(index, "name")}
                  placeholder="TripSit"
                />
              </div>
              <div>
                <label className={labelClass}>Citation URL</label>
                <input
                  className={baseInputClass}
                  value={citation.reference}
                  onChange={handleCitationFieldChange(index, "reference")}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
    <button
      type="button"
      onClick={addCitationEntry}
      className="w-full rounded-xl border border-dashed border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
    >
      Add citation
    </button>
  </section>
);

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
