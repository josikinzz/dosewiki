/**
 * RHF-based Content field components.
 * Includes SubjectiveEffects, Addiction, Interactions, Tolerance, and Notes.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { ShieldAlert, Sparkles, Zap, Timer, FileText } from "lucide-react";
import yaml from "yaml";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { SectionHeader, CharacterCount, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect, TextListInput } from "./rhf";
import type { SubstanceArticle, HarmPotential } from "../../../schema";
import { SectionGenerator } from "../tools/articles/SectionGenerator";
import { useOptionalArticlesContext } from "../tools/articles/ArticlesContext";
import { harmPotentialPrompt } from "../../../data/config/sectionPrompts";

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
        icon={<Sparkles className="h-5 w-5" />}
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

/**
 * Harm Potential fields - covers addiction, dependence, toxicity, and risks.
 * Component is named AddictionFieldsRHF for backward compatibility.
 */
export function AddictionFieldsRHF({ idPrefix }: AddictionFieldsRHFProps) {
  const { register, watch, setValue, getValues } = useFormContext<SubstanceArticle>();
  const addictionValue = watch("harm_potential.addiction_liability") ?? "";
  const dependenceValue = watch("harm_potential.dependence_liability") ?? "";
  
  // Get articles context if available (only in Articles tab)
  const articlesContext = useOptionalArticlesContext();

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated harm potential YAML to form
  // Always overwrites all fields - use empty defaults for missing fields
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const harmPotential: HarmPotential = parsed.harm_potential ?? parsed;
      
      // Always overwrite - use empty defaults for missing fields
      setValue("harm_potential.addiction_liability", harmPotential.addiction_liability ?? "");
      setValue("harm_potential.dependence_liability", harmPotential.dependence_liability ?? "");
      setValue("harm_potential.toxicity.ld50", harmPotential.toxicity?.ld50 ?? "");
      setValue("harm_potential.toxicity.organ_toxicity", harmPotential.toxicity?.organ_toxicity ?? "");
      setValue("harm_potential.toxicity.carcinogenicity", harmPotential.toxicity?.carcinogenicity ?? "");
      setValue("harm_potential.toxicity.other", harmPotential.toxicity?.other ?? "");
      setValue("harm_potential.risks.psychosis", harmPotential.risks?.psychosis ?? "");
      setValue("harm_potential.risks.self_harm", harmPotential.risks?.self_harm ?? "");
      setValue("harm_potential.risks.seizure", harmPotential.risks?.seizure ?? "");
      setValue("harm_potential.risks.other", harmPotential.risks?.other ?? []);
    } catch (error) {
      console.error("Failed to parse generated harm potential YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Harm Potential"
        description="Addiction, dependence, toxicity information, and safety risks."
        icon={<ShieldAlert className="h-5 w-5" />}
      />
      
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionKey="harm_potential"
          sectionLabel="Harm Potential"
          icon={ShieldAlert}
          prompt={harmPotentialPrompt}
          extractedContent={articlesContext.harmPotentialQuotes}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
        />
      )}
      
      {/* Addiction & Dependence */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-addiction-liability`}>
            Addiction Liability
          </Label>
          <Textarea
            id={`${idPrefix}-addiction-liability`}
            className="min-h-[100px]"
            {...register("harm_potential.addiction_liability")}
            placeholder="Describe psychological dependence risk and compulsive use patterns."
          />
          <CharacterCount value={addictionValue} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-dependence-liability`}>
            Dependence Liability
          </Label>
          <Textarea
            id={`${idPrefix}-dependence-liability`}
            className="min-h-[100px]"
            {...register("harm_potential.dependence_liability")}
            placeholder="Describe physical dependence risk and withdrawal potential."
          />
          <CharacterCount value={dependenceValue} />
        </div>
      </div>

      {/* Toxicity */}
      <div className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-white/50">Toxicity</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-ld50`}>
              LD50
            </Label>
            <Input
              id={`${idPrefix}-ld50`}
              {...register("harm_potential.toxicity.ld50")}
              placeholder="e.g., 1475 mg/kg (mice, oral)"
            />
            <p className={helperTextClass}>Include species and route if known.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-organ-toxicity`}>
              Organ Toxicity
            </Label>
            <Input
              id={`${idPrefix}-organ-toxicity`}
              {...register("harm_potential.toxicity.organ_toxicity")}
              placeholder="e.g., Bladder damage with chronic use"
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-carcinogenicity`}>
              Carcinogenicity
            </Label>
            <Input
              id={`${idPrefix}-carcinogenicity`}
              {...register("harm_potential.toxicity.carcinogenicity")}
              placeholder="e.g., No evidence / IARC Group 2B"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-toxicity-other`}>
              Other Toxicity Notes
            </Label>
            <Input
              id={`${idPrefix}-toxicity-other`}
              {...register("harm_potential.toxicity.other")}
              placeholder="e.g., Neurotoxicity at high doses"
            />
          </div>
        </div>
      </div>

      {/* Risks */}
      <div className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-white/50">Risks</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-psychosis`}>
              Psychosis Risk
            </Label>
            <Textarea
              id={`${idPrefix}-psychosis`}
              className="min-h-[80px]"
              {...register("harm_potential.risks.psychosis")}
              placeholder="Describe psychosis risk factors and incidence."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-self-harm`}>
              Self-Harm Risk
            </Label>
            <Textarea
              id={`${idPrefix}-self-harm`}
              className="min-h-[80px]"
              {...register("harm_potential.risks.self_harm")}
              placeholder="Describe self-harm or suicidal ideation risks."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-seizure`}>
              Seizure Risk
            </Label>
            <Textarea
              id={`${idPrefix}-seizure`}
              className="min-h-[80px]"
              {...register("harm_potential.risks.seizure")}
              placeholder="Describe seizure threshold effects."
            />
          </div>
        </div>
        <div className="space-y-2">
          <ControlledTagMultiSelect
            name="harm_potential.risks.other"
            label="Other Risks"
            helperText="Additional notable safety risks not covered above."
            placeholder="Add risk"
            options={[]}
            addButtonLabel="Add risk"
            openStrategy="focus"
          />
        </div>
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
        icon={<Zap className="h-5 w-5" />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <TextListInput
          name="interactions.dangerous"
          label="Dangerous Combinations"
          helperText="Substances that should never be combined."
          placeholder="e.g., Alcohol (Both substances cause...)"
          addButtonLabel="Add dangerous interaction"
        />
        <TextListInput
          name="interactions.unsafe"
          label="Unsafe Combinations"
          helperText="Substances that may cause serious harm when combined."
          placeholder="e.g., Opioids (Risk of respiratory...)"
          addButtonLabel="Add unsafe interaction"
        />
        <div className="lg:col-span-2">
          <TextListInput
            name="interactions.caution"
            label="Use with Caution"
            helperText="Substances that require careful consideration when combined."
            placeholder="e.g., Cannabis (May intensify...)"
            addButtonLabel="Add caution interaction"
          />
        </div>
      </div>
      <p className={helperTextClass}>Each entry becomes an interaction card with severity styling on the live page.</p>
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
        icon={<Timer className="h-5 w-5" />}
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
        icon={<FileText className="h-5 w-5" />}
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
