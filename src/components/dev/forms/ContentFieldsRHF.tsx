/**
 * RHF-based Content field components.
 * Includes SubjectiveEffects, Addiction, Interactions, Tolerance, and Notes.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { Icon } from "../../common/Icon";
import yaml from "yaml";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CharacterCount, CollapsibleSubsection } from "./FormHelpers";
import { ControlledTagMultiSelect, TextListInput } from "./rhf";
import type { SubstanceArticle, HarmPotential, Tolerance, Interactions, RiskLevel, CarcinogenicityLevel } from "../../../schema";
import { SectionGenerator } from "../tools/substance-editor/SectionGenerator";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "../../../hooks/usePrompts";

// Tolerance field labels with icons matching ToleranceSection.tsx
const toleranceLabels: Array<{
  key: "full_tolerance" | "half_tolerance" | "baseline_tolerance";
  label: string;
  icon: string;
}> = [
  { key: "full_tolerance", label: "Full Tolerance", icon: "lucide:arrow-up-wide-narrow" },
  { key: "half_tolerance", label: "Half Tolerance", icon: "lucide:circle-slash-2" },
  { key: "baseline_tolerance", label: "Baseline Reset", icon: "lucide:arrow-down-wide-narrow" },
];

// Risk level options for select dropdowns
const RISK_LEVEL_OPTIONS: Array<{ value: RiskLevel | ""; label: string }> = [
  { value: "", label: "Not assessed" },
  { value: "extremely_low", label: "Extremely Low" },
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "extremely_high", label: "Extremely High" },
];

const CARCINOGENICITY_LEVEL_OPTIONS: Array<{ value: CarcinogenicityLevel | ""; label: string }> = [
  { value: "", label: "Not assessed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "probable", label: "Probable" },
  { value: "possible", label: "Possible" },
  { value: "no_evidence", label: "No Evidence" },
  { value: "unknown", label: "Unknown" },
];

export type AddictionFieldsRHFProps = {
  idPrefix: string;
};

/**
 * Risk level select component
 */
function RiskLevelSelect({
  value,
  onChange,
  id
}: {
  value: RiskLevel | null;
  onChange: (value: RiskLevel | null) => void;
  id: string;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v === "" ? null : v as RiskLevel)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select level" />
      </SelectTrigger>
      <SelectContent>
        {RISK_LEVEL_OPTIONS.map((option) => (
          <SelectItem key={option.value || "none"} value={option.value || "none"}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Harm Potential fields - covers addiction, dependence, toxicity, and risks.
 * Component is named AddictionFieldsRHF for backward compatibility.
 */
export function AddictionFieldsRHF({ idPrefix }: AddictionFieldsRHFProps) {
  const { register, watch, setValue, getValues } = useFormContext<SubstanceArticle>();

  // Watch new schema fields
  const psychologicalDesc = watch("harm_potential.addiction.psychological.description") ?? "";
  const physicalDesc = watch("harm_potential.addiction.physical_dependence.description") ?? "";
  const psychologicalLevel = watch("harm_potential.addiction.psychological.level");
  const physicalLevel = watch("harm_potential.addiction.physical_dependence.level");
  const psychosisLevel = watch("harm_potential.risks.psychosis.level");
  const seizureLevel = watch("harm_potential.risks.seizure.level");
  const selfHarmLevel = watch("harm_potential.risks.self_harm.level");
  const carcinogenicityLevel = watch("harm_potential.toxicity.carcinogenicity.level");

  // Get articles context if available (only in Articles tab)
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: harmPotentialPrompt } = useSectionPrompt("harm_potential");

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated harm potential YAML to form (new schema)
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const hp: HarmPotential = parsed.harm_potential ?? parsed;

      // Addiction
      setValue("harm_potential.addiction.psychological.level", hp.addiction?.psychological?.level ?? null);
      setValue("harm_potential.addiction.psychological.description", hp.addiction?.psychological?.description ?? "");
      setValue("harm_potential.addiction.physical_dependence.level", hp.addiction?.physical_dependence?.level ?? null);
      setValue("harm_potential.addiction.physical_dependence.description", hp.addiction?.physical_dependence?.description ?? "");

      // Toxicity
      setValue("harm_potential.toxicity.ld50", hp.toxicity?.ld50 ?? []);
      setValue("harm_potential.toxicity.organ_toxicity", hp.toxicity?.organ_toxicity ?? []);
      setValue("harm_potential.toxicity.carcinogenicity.level", hp.toxicity?.carcinogenicity?.level ?? null);
      setValue("harm_potential.toxicity.carcinogenicity.evidence", hp.toxicity?.carcinogenicity?.evidence ?? null);
      setValue("harm_potential.toxicity.carcinogenicity.description", hp.toxicity?.carcinogenicity?.description ?? "");
      setValue("harm_potential.toxicity.antibiotic_function.level", hp.toxicity?.antibiotic_function?.level ?? null);
      setValue("harm_potential.toxicity.antibiotic_function.description", hp.toxicity?.antibiotic_function?.description ?? "");
      setValue("harm_potential.toxicity.other", hp.toxicity?.other ?? "");

      // Risks
      setValue("harm_potential.risks.psychosis.level", hp.risks?.psychosis?.level ?? null);
      setValue("harm_potential.risks.psychosis.description", hp.risks?.psychosis?.description ?? "");
      setValue("harm_potential.risks.seizure.level", hp.risks?.seizure?.level ?? null);
      setValue("harm_potential.risks.seizure.description", hp.risks?.seizure?.description ?? "");
      setValue("harm_potential.risks.self_harm.level", hp.risks?.self_harm?.level ?? null);
      setValue("harm_potential.risks.self_harm.description", hp.risks?.self_harm?.description ?? "");
      setValue("harm_potential.risks.other", hp.risks?.other ?? []);
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
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon icon="jam:repeat" className="h-5 w-5 text-rose-300" size={20} />
          Addiction & Dependence
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Psychological Addiction */}
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-psych-level`}>
              Psychological Addiction
            </Label>
            <RiskLevelSelect
              id={`${idPrefix}-psych-level`}
              value={psychologicalLevel}
              onChange={(v) => setValue("harm_potential.addiction.psychological.level", v)}
            />
            <Textarea
              id={`${idPrefix}-psych-desc`}
              className="min-h-[80px]"
              {...register("harm_potential.addiction.psychological.description")}
              placeholder="Describe psychological dependence risk and compulsive use patterns."
            />
            <CharacterCount value={psychologicalDesc} />
          </div>

          {/* Physical Dependence */}
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-phys-level`}>
              Physical Dependence
            </Label>
            <RiskLevelSelect
              id={`${idPrefix}-phys-level`}
              value={physicalLevel}
              onChange={(v) => setValue("harm_potential.addiction.physical_dependence.level", v)}
            />
            <Textarea
              id={`${idPrefix}-phys-desc`}
              className="min-h-[80px]"
              {...register("harm_potential.addiction.physical_dependence.description")}
              placeholder="Describe physical dependence risk and withdrawal potential."
            />
            <CharacterCount value={physicalDesc} />
          </div>
        </div>
      </div>

      {/* Toxicity */}
      <CollapsibleSubsection title="Toxicity" icon={<Icon icon="healthicons:poison-24px" className="h-5 w-5" size={20} />}>
        <div className="space-y-4">
          {/* LD50 - simplified display for now */}
          <div className="space-y-1">
            <Label>LD50 Data (JSON)</Label>
            <Textarea
              className="min-h-[60px] font-mono text-xs"
              value={JSON.stringify(watch("harm_potential.toxicity.ld50") ?? [], null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setValue("harm_potential.toxicity.ld50", parsed);
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              placeholder='[{"species": "Mouse", "route": "IV", "value": 400, "unit": "mg/kg"}]'
            />
          </div>

          {/* Organ Toxicity - simplified display */}
          <div className="space-y-1">
            <Label>Organ Toxicity (JSON)</Label>
            <Textarea
              className="min-h-[80px] font-mono text-xs"
              value={JSON.stringify(watch("harm_potential.toxicity.organ_toxicity") ?? [], null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setValue("harm_potential.toxicity.organ_toxicity", parsed);
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              placeholder='[{"system": "Urinary", "findings": "...", "mechanism": "...", "notes": "..."}]'
            />
          </div>

          {/* Carcinogenicity */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-carc-level`}>Carcinogenicity Level</Label>
              <Select
                value={carcinogenicityLevel ?? ""}
                onValueChange={(v) => setValue("harm_potential.toxicity.carcinogenicity.level", v === "" ? null : v as CarcinogenicityLevel)}
              >
                <SelectTrigger id={`${idPrefix}-carc-level`}>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {CARCINOGENICITY_LEVEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value || "none"} value={option.value || "none"}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-carc-desc`}>Carcinogenicity Notes</Label>
              <Input
                id={`${idPrefix}-carc-desc`}
                {...register("harm_potential.toxicity.carcinogenicity.description")}
                placeholder="e.g., No evidence / IARC Group 2B"
              />
            </div>
          </div>

          {/* Other Toxicity */}
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-toxicity-other`}>Other Toxicity Notes</Label>
            <Textarea
              id={`${idPrefix}-toxicity-other`}
              className="min-h-[60px]"
              {...register("harm_potential.toxicity.other")}
              placeholder="e.g., Neurotoxicity at high doses"
            />
          </div>
        </div>
      </CollapsibleSubsection>

      {/* Risks */}
      <CollapsibleSubsection title="Risks" icon={<Icon icon="streamline:dangerous-zone-sign-remix" className="h-5 w-5" size={20} />}>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Psychosis */}
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-psychosis-level`}>Psychosis Risk</Label>
            <RiskLevelSelect
              id={`${idPrefix}-psychosis-level`}
              value={psychosisLevel}
              onChange={(v) => setValue("harm_potential.risks.psychosis.level", v)}
            />
            <Textarea
              id={`${idPrefix}-psychosis-desc`}
              className="min-h-[60px]"
              {...register("harm_potential.risks.psychosis.description")}
              placeholder="Describe psychosis risk factors."
            />
          </div>

          {/* Seizure */}
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-seizure-level`}>Seizure Risk</Label>
            <RiskLevelSelect
              id={`${idPrefix}-seizure-level`}
              value={seizureLevel}
              onChange={(v) => setValue("harm_potential.risks.seizure.level", v)}
            />
            <Textarea
              id={`${idPrefix}-seizure-desc`}
              className="min-h-[60px]"
              {...register("harm_potential.risks.seizure.description")}
              placeholder="Describe seizure threshold effects."
            />
          </div>

          {/* Self-harm */}
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-selfharm-level`}>Self-Harm Risk</Label>
            <RiskLevelSelect
              id={`${idPrefix}-selfharm-level`}
              value={selfHarmLevel}
              onChange={(v) => setValue("harm_potential.risks.self_harm.level", v)}
            />
            <Textarea
              id={`${idPrefix}-selfharm-desc`}
              className="min-h-[60px]"
              {...register("harm_potential.risks.self_harm.description")}
              placeholder="Describe self-harm or injury risks."
            />
          </div>
        </div>
        <div className="space-y-1 mt-4">
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
  const { setValue, getValues } = useFormContext<SubstanceArticle>();
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: interactionsPrompt } = useSectionPrompt("interactions");

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated interactions YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const interactions: Interactions = parsed.interactions ?? parsed;

      setValue("interactions.dangerous", interactions.dangerous ?? []);
      setValue("interactions.unsafe", interactions.unsafe ?? []);
      setValue("interactions.caution", interactions.caution ?? []);
    } catch (error) {
      console.error("Failed to parse generated interactions YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-4">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Interactions"
          sectionKey="interactions"
          prompt={interactionsPrompt}
          extractedContent={null}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
        />
      )}

      <CollapsibleSubsection
        title="Dangerous Combinations"
        icon={<Icon icon="lucide:skull" className="h-5 w-5 text-red-400" size={20} />}
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
        icon={<Icon icon="lucide:hospital" className="h-5 w-5 text-orange-400" size={20} />}
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
        icon={<Icon icon="lucide:triangle-alert" className="h-5 w-5 text-amber-400" size={20} />}
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
  const { register, setValue, getValues } = useFormContext<SubstanceArticle>();
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: tolerancePrompt } = useSectionPrompt("tolerance");

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated tolerance YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const tolerance: Tolerance = parsed.tolerance ?? parsed;

      setValue("tolerance.full_tolerance", tolerance.full_tolerance ?? "");
      setValue("tolerance.half_tolerance", tolerance.half_tolerance ?? "");
      setValue("tolerance.baseline_tolerance", tolerance.baseline_tolerance ?? "");
      setValue("tolerance.cross_tolerance", tolerance.cross_tolerance ?? []);
    } catch (error) {
      console.error("Failed to parse generated tolerance YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Tolerance"
          sectionKey="tolerance"
          prompt={tolerancePrompt}
          extractedContent={articlesContext.toleranceQuotes}
          extractedSources={articlesContext.toleranceSources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
          quoteSection="tolerance"
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {toleranceLabels.map(({ key, label, icon }) => (
          <div key={`${idPrefix}-${key}`} className="space-y-1">
            <Label className="inline-flex items-center gap-1.5">
              <Icon icon={icon} size={14} className="text-fuchsia-300" />
              {label}
            </Label>
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
          icon={<Icon icon="lucide:merge" size={14} className="text-fuchsia-300" />}
        />
      </div>
    </section>
  );
}

export type NotesFieldsRHFProps = {
  idPrefix: string;
};

export function NotesFieldsRHF({ idPrefix }: NotesFieldsRHFProps) {
  const { register, watch, setValue, getValues } = useFormContext<SubstanceArticle>();
  const summaryValue = watch("summary") ?? "";
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: summaryPrompt } = useSectionPrompt("summary");

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated summary YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const summary = parsed.summary ?? parsed;

      if (typeof summary === "string") {
        setValue("summary", summary);
      }
    } catch (error) {
      console.error("Failed to parse generated summary YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Summary"
          sectionKey="summary"
          prompt={summaryPrompt}
          extractedContent={articlesContext.summaryQuotes}
          extractedSources={articlesContext.summarySources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
          quoteSection="summary"
        />
      )}

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-summary`} className="flex items-center gap-1.5">
          <Icon icon="lucide:notebook-text" className="h-4 w-4 text-white/60" size={16} />
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
