/**
 * RHF-based Content field components.
 * Includes SubjectiveEffects, Addiction, Interactions, Tolerance, and Notes.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { NotebookText, Skull, TriangleAlert, Hospital, Zap } from "lucide-react";
import yaml from "yaml";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { CharacterCount, CollapsibleSubsection } from "./FormHelpers";
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
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Harm Potential"
          sectionKey="harm_potential"
          prompt={harmPotentialPrompt}
          extractedContent={articlesContext.harmPotentialQuotes}
          extractedSources={articlesContext.harmPotentialSources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
          quoteSection="harm_potential"
        />
      )}
      
      {/* Addiction & Dependence */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
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
        <div className="space-y-1">
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
      <CollapsibleSubsection title="Toxicity" icon={<Skull className="h-5 w-5" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-ld50`}>
              LD50
            </Label>
            <Input
              id={`${idPrefix}-ld50`}
              {...register("harm_potential.toxicity.ld50")}
              placeholder="e.g., 1475 mg/kg (mice, oral)"
            />
          </div>
          <div className="space-y-1">
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
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-carcinogenicity`}>
              Carcinogenicity
            </Label>
            <Input
              id={`${idPrefix}-carcinogenicity`}
              {...register("harm_potential.toxicity.carcinogenicity")}
              placeholder="e.g., No evidence / IARC Group 2B"
            />
          </div>
          <div className="space-y-1">
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
      </CollapsibleSubsection>

      {/* Risks */}
      <CollapsibleSubsection title="Risks" icon={<Zap className="h-5 w-5" />}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
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
          <div className="space-y-1">
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
          <div className="space-y-1">
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
        <div className="space-y-1">
          <ControlledTagMultiSelect
            name="harm_potential.risks.other"
            label="Other Risks"
            placeholder="Add risk"
            options={[]}
            addButtonLabel="Add"
            openStrategy="focus"
          />
        </div>
      </CollapsibleSubsection>
    </section>
  );
}

export function InteractionsFieldsRHF() {
  return (
    <section className="space-y-4">
      <CollapsibleSubsection
        title="Dangerous Combinations"
        icon={<Skull className="h-5 w-5 text-red-400" />}
      >
        <TextListInput
          name="interactions.dangerous"
          label="Dangerous"
          placeholder="e.g., Alcohol (Both substances cause...)"
          addButtonLabel="Add dangerous"
        />
      </CollapsibleSubsection>
      
      <CollapsibleSubsection
        title="Unsafe Combinations"
        icon={<TriangleAlert className="h-5 w-5 text-orange-400" />}
      >
        <TextListInput
          name="interactions.unsafe"
          label="Unsafe"
          placeholder="e.g., Opioids (Risk of respiratory...)"
          addButtonLabel="Add unsafe"
        />
      </CollapsibleSubsection>
      
      <CollapsibleSubsection
        title="Use with Caution"
        icon={<Hospital className="h-5 w-5 text-yellow-400" />}
      >
        <TextListInput
          name="interactions.caution"
          label="Caution"
          placeholder="e.g., Cannabis (May intensify...)"
          addButtonLabel="Add caution"
        />
      </CollapsibleSubsection>
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
      <div className="grid gap-4 md:grid-cols-3">
        {toleranceLabels.map(([key, label]) => (
          <div key={`${idPrefix}-${key}`} className="space-y-1">
            <Label>{label}</Label>
            <Input
              {...register(`tolerance.${key}`)}
              placeholder="e.g., ~3 days"
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <ControlledTagMultiSelect
          name="tolerance.cross_tolerance"
          label="Cross Tolerances"
          placeholder="Add cross-tolerance"
          options={[]}
          addButtonLabel="Add"
          openStrategy="focus"
        />
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
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-summary`} className="flex items-center gap-1.5">
          <NotebookText className="h-4 w-4 text-white/60" />
          Summary
        </Label>
        <Textarea
          id={`${idPrefix}-summary`}
          className="min-h-[140px]"
          {...register("summary")}
          placeholder="Brief summary of the substance."
        />
        <CharacterCount value={summaryValue} />
      </div>
    </section>
  );
}
