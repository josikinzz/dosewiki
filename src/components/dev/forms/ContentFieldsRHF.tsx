/**
 * RHF-based Content field components.
 * Includes SubjectiveEffects, Addiction, Interactions, Tolerance, and Notes.
 */

import { useFormContext } from "react-hook-form";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { SectionHeader, CharacterCount, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
import type { SubstanceArticle } from "../../../schema";

// Tolerance field labels
const toleranceLabels: Array<["full_tolerance" | "half_tolerance" | "baseline_tolerance", string]> = [
  ["full_tolerance", "Full Tolerance"],
  ["half_tolerance", "Half Tolerance"],
  ["baseline_tolerance", "Baseline Reset"],
];

export type SubjectiveEffectsFieldsRHFProps = {
  idPrefix: string;
};

export function SubjectiveEffectsFieldsRHF({ idPrefix }: SubjectiveEffectsFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Subjective Effects"
        description="Powers the badge cloud on the Substance page."
      />
      {/* Subjective effects now use a flexible subcategory structure.
          Edit effects directly in articles.json for now. A dedicated editor component
          for the new Record<string, EffectEntry[]> structure is planned. */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/60">
          Subjective effects now support flexible subcategories with per-effect descriptions.
          Edit effects directly in <code className="text-fuchsia-300">articles.json</code> or use the YAML generator.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-effects-overview`}>Effects Overview</Label>
        <Textarea
          id={`${idPrefix}-effects-overview`}
          className="min-h-[100px]"
          {...register("subjective_effects.notes.overview")}
          placeholder="General overview of the substance's effects."
        />
      </div>
    </section>
  );
}

export type AddictionFieldsRHFProps = {
  idPrefix: string;
};

export function AddictionFieldsRHF({ idPrefix }: AddictionFieldsRHFProps) {
  const { register, watch } = useFormContext<SubstanceArticle>();
  const addictionValue = watch("harm_potential.addiction_liability") ?? "";

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Addiction Potential"
        description="Surfaces as the dedicated Addiction Potential card."
      />
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-addiction-liability`}>
          Addiction Liability
        </Label>
        <Textarea
          id={`${idPrefix}-addiction-liability`}
          className="min-h-[120px]"
          {...register("harm_potential.addiction_liability")}
          placeholder="Summarise dependence risk, compulsion, and mitigation guidance."
        />
        <CharacterCount value={addictionValue} />
        <p className={helperTextClass}>Use short paragraphs focused on dependency risk and mitigation tips.</p>
      </div>
    </section>
  );
}

export function InteractionsFieldsRHF() {
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Interactions"
        description="Match the live Interactions buckets: Dangerous, Unsafe, and Use with Caution."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ControlledTagMultiSelect
          name="interactions.dangerous"
          label="Dangerous Combinations"
          helperText="Substances that should never be combined."
          placeholder="Add dangerous interaction"
          options={[]}
          addButtonLabel="Add interaction"
          openStrategy="focus"
        />
        <ControlledTagMultiSelect
          name="interactions.unsafe"
          label="Unsafe Combinations"
          helperText="Substances that may cause serious harm when combined."
          placeholder="Add unsafe interaction"
          options={[]}
          addButtonLabel="Add interaction"
          openStrategy="focus"
        />
        <div className="md:col-span-2">
          <ControlledTagMultiSelect
            name="interactions.caution"
            label="Use with Caution"
            helperText="Substances that require careful consideration when combined."
            placeholder="Add caution interaction"
            options={[]}
            addButtonLabel="Add interaction"
            openStrategy="focus"
          />
        </div>
      </div>
      <p className={helperTextClass}>Each entry becomes an interaction chip with severity-colour styling.</p>
    </section>
  );
}

export type ToleranceFieldsRHFProps = {
  idPrefix: string;
};

export function ToleranceFieldsRHF({ idPrefix }: ToleranceFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
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
              {...register(`tolerance.${key}`)}
              placeholder="e.g., ~3 days"
            />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <ControlledTagMultiSelect
          name="tolerance.cross_tolerance"
          label="Cross Tolerances"
          helperText="Substances or classes that share tolerance."
          placeholder="Add cross-tolerance"
          options={[]}
          addButtonLabel="Add cross-tolerance"
          openStrategy="focus"
        />
        <p className={helperTextClass}>Rendered beneath the timeline cards.</p>
      </div>
    </section>
  );
}

export type NotesFieldsRHFProps = {
  idPrefix: string;
};

export function NotesFieldsRHF({ idPrefix }: NotesFieldsRHFProps) {
  const { register, watch } = useFormContext<SubstanceArticle>();
  const summaryValue = watch("summary") ?? "";

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Summary"
        description="Article summary and additional notes."
      />
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-summary`}>
          Summary
        </Label>
        <Textarea
          id={`${idPrefix}-summary`}
          className="min-h-[140px]"
          {...register("summary")}
          placeholder="Brief summary of the substance."
        />
        <CharacterCount value={summaryValue} />
        <p className={helperTextClass}>Supports Markdown basics (headings, emphasis, lists).</p>
      </div>
    </section>
  );
}
