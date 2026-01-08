import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { parseListInput } from "../../../utils/forms/articleDraftForm";

import { SectionHeader, CharacterCount, ListPreview, helperTextClass } from "./FormHelpers";
import {
  toleranceLabels,
  type SubjectiveEffectsFieldsProps,
  type AddictionFieldsProps,
  type InteractionsFieldsProps,
  type ToleranceFieldsProps,
  type NotesFieldsProps,
} from "./types";

export const SubjectiveEffectsFields = ({ idPrefix, form, handleFieldChange }: SubjectiveEffectsFieldsProps) => {
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

export const AddictionFields = ({ idPrefix, form, handleFieldChange }: AddictionFieldsProps) => (
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

export const InteractionsFields = ({ form, handleFieldChange }: InteractionsFieldsProps) => (
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

export const ToleranceFields = ({
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

export const NotesFields = ({ idPrefix, form, handleFieldChange }: NotesFieldsProps) => (
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
