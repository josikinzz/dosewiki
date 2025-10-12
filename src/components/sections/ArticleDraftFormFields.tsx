import type { ArticleDraftFormController } from "../../hooks/useArticleDraftForm";
import type { DoseRangeForm, DurationForm, ToleranceForm } from "../../utils/articleDraftForm";

const baseInputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";
const baseTextareaClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-white placeholder:text-white/45 shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30";

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

const toleranceLabels: Array<[keyof ToleranceForm, string]> = [
  ["fullTolerance", "Full tolerance"],
  ["halfTolerance", "Half tolerance"],
  ["zeroTolerance", "Baseline reset"],
];

type ArticleDraftFormFieldsProps = {
  idPrefix: string;
  controller: ArticleDraftFormController;
};

export function ArticleDraftFormFields({ idPrefix, controller }: ArticleDraftFormFieldsProps) {
  const {
    form,
    handleFieldChange,
    handleDurationFieldChange,
    handleToleranceFieldChange,
    handleRouteFieldChange,
    handleDoseRangeFieldChange,
    addRouteEntry,
    removeRouteEntry,
    handleCitationFieldChange,
    addCitationEntry,
    removeCitationEntry,
  } = controller;

  return (
    <>
      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Identity</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">Core metadata</h2>
        </div>
        <div>
          <label
            className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
            htmlFor={`${idPrefix}-title`}
          >
            Title
          </label>
          <input
            id={`${idPrefix}-title`}
            className={baseInputClass}
            value={form.title}
            onChange={handleFieldChange("title")}
            placeholder="Primary article title"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-id`}
            >
              Article ID
            </label>
            <input
              id={`${idPrefix}-id`}
              className={baseInputClass}
              value={form.id}
              onChange={handleFieldChange("id")}
              placeholder="e.g., 101"
            />
          </div>
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-index`}
            >
              Index category
            </label>
            <input
              id={`${idPrefix}-index`}
              className={baseInputClass}
              value={form.indexCategory}
              onChange={handleFieldChange("indexCategory")}
              placeholder="Optional catalog tag"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Naming</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">Drug identity & lookup</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-drug-name`}
            >
              Display name
            </label>
            <input
              id={`${idPrefix}-drug-name`}
              className={baseInputClass}
              value={form.drugName}
              onChange={handleFieldChange("drugName")}
              placeholder="e.g., LSD"
            />
          </div>
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-chemical-name`}
            >
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
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-alternative-name`}
            >
              Alternative name
            </label>
            <input
              id={`${idPrefix}-alternative-name`}
              className={baseInputClass}
              value={form.alternativeName}
              onChange={handleFieldChange("alternativeName")}
              placeholder="Common alias (optional)"
            />
          </div>
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-search-url`}
            >
              Reference URL
            </label>
            <input
              id={`${idPrefix}-search-url`}
              className={baseInputClass}
              value={form.searchUrl}
              onChange={handleFieldChange("searchUrl")}
              placeholder="https://..."
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Classification</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">Mechanisms & categories</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-chemical-class`}
            >
              Chemical class
            </label>
            <input
              id={`${idPrefix}-chemical-class`}
              className={baseInputClass}
              value={form.chemicalClass}
              onChange={handleFieldChange("chemicalClass")}
              placeholder="e.g., Lysergamide"
            />
          </div>
          <div>
            <label
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
              htmlFor={`${idPrefix}-psychoactive-class`}
            >
              Psychoactive class
            </label>
            <input
              id={`${idPrefix}-psychoactive-class`}
              className={baseInputClass}
              value={form.psychoactiveClass}
              onChange={handleFieldChange("psychoactiveClass")}
              placeholder="e.g., Psychedelic"
            />
          </div>
        </div>
        <div>
          <label
            className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
            htmlFor={`${idPrefix}-mechanism`}
          >
            Mechanism of action
          </label>
          <textarea
            id={`${idPrefix}-mechanism`}
            className={`${baseTextareaClass} min-h-[100px]`}
            value={form.mechanismOfAction}
            onChange={handleFieldChange("mechanismOfAction")}
            placeholder="Receptor profile and pharmacology"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Safety</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">Dosage guidance</h2>
        </div>
        <div className="space-y-4">
          {form.routes.map((route, index) => {
            const routeKey = `${idPrefix}-route-${index}`;
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
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                      Administration route
                    </label>
                    <input
                      className={baseInputClass}
                      value={route.route}
                      onChange={handleRouteFieldChange(index, "route")}
                      placeholder="e.g., Oral"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                      Units
                    </label>
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
                      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                        {label}
                      </label>
                      <input
                        className={baseInputClass}
                        value={route.doseRanges[key]}
                        onChange={handleDoseRangeFieldChange(index, key)}
                        placeholder="e.g., 10-20 µg"
                      />
                    </div>
                  ))}
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
        <p className="text-[11px] text-white/45">Separate dose ranges with hyphens; omit units when not applicable.</p>

      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Safety</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">Interaction risks</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
              Dangerous combinations
            </label>
            <textarea
              className={`${baseTextareaClass} min-h-[80px] py-2`}
              value={form.interactionsDangerousInput}
              onChange={handleFieldChange("interactionsDangerousInput")}
              placeholder="MAOIs"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
              Unsafe combinations
            </label>
            <textarea
              className={`${baseTextareaClass} min-h-[80px] py-2`}
              value={form.interactionsUnsafeInput}
              onChange={handleFieldChange("interactionsUnsafeInput")}
              placeholder="SSRIs"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
              Use with caution
            </label>
            <textarea
              className={`${baseTextareaClass} min-h-[80px] py-2`}
              value={form.interactionsCautionInput}
              onChange={handleFieldChange("interactionsCautionInput")}
              placeholder="Alcohol"
            />
          </div>
        </div>
        <p className="text-[11px] text-white/45">List each interaction on its own line.</p>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Experience</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">Subjective effects</h2>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">Subjective effects</label>
          <textarea
            className={`${baseTextareaClass} min-h-[80px] py-2`}
            value={form.subjectiveEffectsInput}
            onChange={handleFieldChange("subjectiveEffectsInput")}
            placeholder="Euphoria, time dilation"
          />
        </div>
        <p className="text-[11px] text-white/45">List each effect on its own line.</p>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Pharmacokinetics</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">Duration & tolerance</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
              Half-life (optional)
            </label>
            <input
              className={baseInputClass}
              value={form.halfLife}
              onChange={handleFieldChange("halfLife")}
              placeholder="e.g., ~3.6 hours"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
              Addiction potential
            </label>
            <input
              className={baseInputClass}
              value={form.addictionPotential}
              onChange={handleFieldChange("addictionPotential")}
              placeholder="e.g., Low"
            />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
            Notes
          </label>
          <textarea
            className={`${baseTextareaClass} min-h-[100px] py-2`}
            value={form.notes}
            onChange={handleFieldChange("notes")}
            placeholder="Set & setting reminders, safety tips, unique properties"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {durationLabels.map(([key, label, placeholder]) => (
            <div key={`${idPrefix}-${key}`}>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">{label}</label>
              <input
                className={baseInputClass}
                value={form.duration[key]}
                onChange={handleDurationFieldChange(key)}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {toleranceLabels.map(([key, label]) => (
            <div key={`${idPrefix}-${key}`}>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                {label}
              </label>
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
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
            Cross tolerances
          </label>
          <textarea
            className={`${baseTextareaClass} min-h-[80px] py-2`}
            value={form.crossTolerancesInput}
            onChange={handleFieldChange("crossTolerancesInput")}
            placeholder="Other arylcyclohexylamines"
          />
        </div>
        <p className="text-[11px] text-white/45">List each item on its own line.</p>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Citations</p>
          <h2 className="text-lg font-semibold text-fuchsia-200">References</h2>
        </div>
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
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                      Source name
                    </label>
                    <input
                      className={baseInputClass}
                      value={citation.name}
                      onChange={handleCitationFieldChange(index, "name")}
                      placeholder="TripSit"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
                      Reference URL
                    </label>
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
    </>
  );
}
