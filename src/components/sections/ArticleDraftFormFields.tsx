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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const helperTextClass = "text-[11px] text-white/45";

const doseRangeLabels: Array<[keyof DoseRangeForm, string]> = [
  ["threshold", "Threshold"],
  ["light", "Light"],
  ["moderate", "Moderate"],
  ["strong", "Strong"],
  ["heavy", "Heavy"],
];

const durationLabels: Array<[keyof DurationForm, string, string]> = [
  ["totalDuration", "Total", "e.g., 6-8 hours"],
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["comeUp", "Come-up", "e.g., 30-60 minutes"],
  ["peak", "Peak", "e.g., 2-3 hours"],
  ["offset", "Offset", "e.g., ~2 hours"],
  ["afterEffects", "After effects", "e.g., Residual stimulation"],
];

const routeDurationLabels: Array<[keyof DurationStagePayload, string, string]> = [
  ["total_duration", "Total", "e.g., 6-8 hours"],
  ["onset", "Onset", "e.g., 15-30 minutes"],
  ["come_up", "Come-up", "e.g., 30-60 minutes"],
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
        <Badge
          key={`${item}-${index}`}
          variant="secondary"
        >
          {item}
        </Badge>
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
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-display-title`}>
          Display name / Title
        </Label>
        <Input
          id={`${idPrefix}-display-title`}
          value={displayNameTitleValue}
          onChange={handleDisplayTitleChange}
          placeholder="Primary article title"
        />
        <p className={helperTextClass}>
          Keeps the hero heading and display name badge in sync.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-id`}>
            Article ID
          </Label>
          <Input
            id={`${idPrefix}-id`}
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-substitutive-name`}>
            Substitutive name
          </Label>
          <Input
            id={`${idPrefix}-substitutive-name`}
            value={form.substitutiveName}
            onChange={handleFieldChange("substitutiveName")}
            placeholder="Systematic or ISO name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-iupac-name`}>
            IUPAC name
          </Label>
          <Input
            id={`${idPrefix}-iupac-name`}
            value={form.iupacName}
            onChange={handleFieldChange("iupacName")}
            placeholder="Add full IUPAC naming (optional)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-botanical-name`}>
            Botanical name
          </Label>
          <Input
            id={`${idPrefix}-botanical-name`}
            value={form.botanicalName}
            onChange={handleFieldChange("botanicalName")}
            placeholder="Latin binomial (optional)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-alternative-name`}>
            Alternative name
          </Label>
          <Input
            id={`${idPrefix}-alternative-name`}
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRouteEntry(index)}
                >
                  Remove
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Administration route</Label>
                <Input
                  value={route.route}
                  onChange={handleRouteFieldChange(index, "route")}
                  placeholder="e.g., Oral"
                />
              </div>
              <div className="space-y-2">
                <Label>Units</Label>
                <Input
                  value={route.units}
                  onChange={handleRouteFieldChange(index, "units")}
                  placeholder="e.g., µg"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {doseRangeLabels.map(([key, label]) => (
                <div key={`${routeKey}-${key}`} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    value={route.doseRanges[key]}
                    onChange={handleDoseRangeFieldChange(index, key)}
                    placeholder="e.g., 10-20 µg"
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {routeDurationLabels.map(([stageKey, label, placeholder]) => (
                <div key={`${routeKey}-duration-${stageKey}`} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    value={durationRoute?.stages?.[stageKey] ?? ""}
                    onChange={handleDurationRouteStageChange(index, stageKey)}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyDurationDefaultsToRoute(index)}
              >
                Copy defaults
              </Button>
            </div>
          </div>
        );
      })}
    </div>
    <Button
      type="button"
      variant="outline"
      className="w-full border-dashed"
      onClick={addRouteEntry}
    >
      Add route
    </Button>
    <p className={helperTextClass}>Separate ranges with hyphens; omit values when data is unavailable.</p>
    <div className="grid gap-4 md:grid-cols-2">
      {durationLabels.map(([key, label, placeholder]) => (
        <div key={`${idPrefix}-${key}`} className="space-y-2">
          <Label>{label}</Label>
          <Input
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
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-half-life`}>
          Half-life (optional)
        </Label>
        <Input
          id={`${idPrefix}-half-life`}
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
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-subjective-effects`}>
          Subjective effects
        </Label>
        <Textarea
          id={`${idPrefix}-subjective-effects`}
          className="min-h-[100px]"
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
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-addiction-potential`}>
        Addiction potential summary
      </Label>
      <Textarea
        id={`${idPrefix}-addiction-potential`}
        className="min-h-[120px]"
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
      <div className="space-y-2">
        <Label>Dangerous combinations</Label>
        <Textarea
          className="min-h-[100px]"
          value={form.interactionsDangerousInput}
          onChange={handleFieldChange("interactionsDangerousInput")}
          placeholder="MAOIs"
        />
      </div>
      <div className="space-y-2">
        <Label>Unsafe combinations</Label>
        <Textarea
          className="min-h-[100px]"
          value={form.interactionsUnsafeInput}
          onChange={handleFieldChange("interactionsUnsafeInput")}
          placeholder="SSRIs"
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Use with caution</Label>
        <Textarea
          className="min-h-[100px]"
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
        <div key={`${idPrefix}-${key}`} className="space-y-2">
          <Label>{label}</Label>
          <Input
            value={form.tolerance[key]}
            onChange={handleToleranceFieldChange(key)}
            placeholder="e.g., ~3 days"
          />
        </div>
      ))}
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-cross-tolerances`}>
        Cross tolerances
      </Label>
      <Textarea
        id={`${idPrefix}-cross-tolerances`}
        className="min-h-[100px]"
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
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-notes`}>
        Notes
      </Label>
      <Textarea
        id={`${idPrefix}-notes`}
        className="min-h-[140px]"
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCitationEntry(index)}
                >
                  Remove
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Citation label</Label>
                <Input
                  value={citation.name}
                  onChange={handleCitationFieldChange(index, "name")}
                  placeholder="TripSit"
                />
              </div>
              <div className="space-y-2">
                <Label>Citation URL</Label>
                <Input
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
    <Button
      type="button"
      variant="outline"
      className="w-full border-dashed"
      onClick={addCitationEntry}
    >
      Add citation
    </Button>
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
