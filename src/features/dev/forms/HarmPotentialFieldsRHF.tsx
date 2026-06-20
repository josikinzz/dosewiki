import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
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
import { ArticleSectionGenerator } from "./ArticleSectionGenerator";
import { CharacterCount, CollapsibleSubsection } from "./FormHelpers";
import type {
  CarcinogenicityLevel,
  LD50Entry,
  OrganToxicityEntry,
  SubstanceArticle,
} from "@/schema";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import {
  CARCINOGENICITY_LEVEL_OPTIONS,
  LD50ArrayEditor,
  OrganToxicityArrayEditor,
  RiskLevelSelect,
} from "./contentFieldsShared";
import { buildGeneratedSectionUpdate } from "@/lib/article/generatedSectionUpdate";

export type AddictionFieldsRHFProps = {
  idPrefix: string;
};

export function AddictionFieldsRHF({ idPrefix }: AddictionFieldsRHFProps) {
  const { getValues, register, setValue, watch } = useFormContext<SubstanceArticle>();

  const psychologicalDesc = watch("harm_potential.addiction.psychological.description") ?? "";
  const physicalDesc = watch("harm_potential.addiction.physical_dependence.description") ?? "";
  const psychologicalLevel = watch("harm_potential.addiction.psychological.level");
  const physicalLevel = watch("harm_potential.addiction.physical_dependence.level");
  const psychosisLevel = watch("harm_potential.psychosis.level");
  const seizureLevel = watch("harm_potential.seizure.level");
  const carcinogenicityLevel = watch("harm_potential.toxicity.carcinogenicity.level");

  const articlesContext = useOptionalSubstanceEditorContext();
  const { content: harmPotentialPrompt } = useSectionPrompt("harm_potential");

  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      return yaml.stringify(getValues(), { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const result = buildGeneratedSectionUpdate(
        getValues(),
        "harm_potential",
        { kind: "generated_yaml", content: generatedYaml },
        "editor_apply",
      );
      const harmPotential = result.nextArticle.harm_potential;

      setValue("harm_potential.addiction.psychological.level", harmPotential.addiction?.psychological?.level ?? null);
      setValue("harm_potential.addiction.psychological.description", harmPotential.addiction?.psychological?.description ?? "");
      setValue("harm_potential.addiction.physical_dependence.level", harmPotential.addiction?.physical_dependence?.level ?? null);
      setValue("harm_potential.addiction.physical_dependence.description", harmPotential.addiction?.physical_dependence?.description ?? "");

      setValue("harm_potential.toxicity.lethal_dosage.notes", harmPotential.toxicity?.lethal_dosage?.notes ?? "");

      const ld50Data = harmPotential.toxicity?.lethal_dosage?.ld50 ?? harmPotential.toxicity?.ld50 ?? [];
      const carcinogenicity = harmPotential.toxicity?.carcinogenicity;
      const carcinogenicityValue = carcinogenicity && typeof carcinogenicity === "object" ? carcinogenicity : null;
      const antibioticFunction = harmPotential.toxicity?.antibiotic_function;
      const antibioticFunctionValue = antibioticFunction && typeof antibioticFunction === "object" ? antibioticFunction : null;

      setValue("harm_potential.toxicity.lethal_dosage.ld50", Array.isArray(ld50Data) ? ld50Data : []);
      setValue("harm_potential.toxicity.organ_toxicity", harmPotential.toxicity?.organ_toxicity ?? []);
      setValue("harm_potential.toxicity.carcinogenicity.level", carcinogenicityValue?.level ?? null);
      setValue("harm_potential.toxicity.carcinogenicity.evidence", carcinogenicityValue?.evidence ?? null);
      setValue("harm_potential.toxicity.carcinogenicity.description", carcinogenicityValue?.description ?? "");
      setValue("harm_potential.toxicity.antibiotic_function.level", antibioticFunctionValue?.level ?? null);
      setValue("harm_potential.toxicity.antibiotic_function.description", antibioticFunctionValue?.description ?? "");
      setValue("harm_potential.toxicity.other", harmPotential.toxicity?.other ?? "");

      setValue("harm_potential.psychosis.level", harmPotential.psychosis?.level ?? null);
      setValue("harm_potential.psychosis.description", harmPotential.psychosis?.description ?? "");
      setValue("harm_potential.seizure.level", harmPotential.seizure?.level ?? null);
      setValue("harm_potential.seizure.description", harmPotential.seizure?.description ?? "");
    } catch (error) {
      console.error("Failed to parse generated harm potential YAML:", error);
    }
  }, [getValues, setValue]);

  const ld50Entries = (() => {
    const currentValue = watch("harm_potential.toxicity.lethal_dosage.ld50");
    if (Array.isArray(currentValue)) {
      return currentValue as LD50Entry[];
    }

    const legacyValue = watch("harm_potential.toxicity.ld50");
    return Array.isArray(legacyValue) ? (legacyValue as LD50Entry[]) : [];
  })();

  const organToxicityEntries = (() => {
    const currentValue = watch("harm_potential.toxicity.organ_toxicity");
    return Array.isArray(currentValue) ? (currentValue as OrganToxicityEntry[]) : [];
  })();

  return (
    <section className="space-y-6">
      {articlesContext && (
        <ArticleSectionGenerator
          sectionLabel="Harm Potential"
          sectionKey="harm_potential"
          prompt={harmPotentialPrompt}
          extractedContent={articlesContext.harmPotentialQuotes}
          extractedSources={articlesContext.harmPotentialSources}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          quoteSection="harm_potential"
        />
      )}

      <div className="space-y-3">
        <h3 className="theme-accent-heading flex items-center gap-2 text-sm font-semibold">
          <Icon icon="jam:repeat" className="theme-icon-accent h-5 w-5" size={20} />
          Addiction & Dependence
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-psych-level`}>Psychological Addiction</Label>
            <RiskLevelSelect
              id={`${idPrefix}-psych-level`}
              value={psychologicalLevel}
              onChange={(nextValue) => setValue("harm_potential.addiction.psychological.level", nextValue)}
            />
            <Textarea
              id={`${idPrefix}-psych-desc`}
              className="min-h-[80px]"
              {...register("harm_potential.addiction.psychological.description")}
              placeholder="Describe psychological dependence risk and compulsive use patterns."
            />
            <CharacterCount value={psychologicalDesc} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-phys-level`}>Physical Dependence</Label>
            <RiskLevelSelect
              id={`${idPrefix}-phys-level`}
              value={physicalLevel}
              onChange={(nextValue) => setValue("harm_potential.addiction.physical_dependence.level", nextValue)}
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

      <CollapsibleSubsection
        title="Toxicity"
        icon={<Icon icon="healthicons:poison-24px" className="h-5 w-5" size={20} />}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-lethal-dosage-notes`}>Lethal Dosage Notes</Label>
            <Textarea
              id={`${idPrefix}-lethal-dosage-notes`}
              className="min-h-[60px]"
              {...register("harm_potential.toxicity.lethal_dosage.notes")}
              placeholder="Approximate lethal dose estimates, human case reports, or informal data that doesn't fit the LD50 table format."
            />
          </div>

          <LD50ArrayEditor
            entries={ld50Entries}
            onChange={(entries) => setValue("harm_potential.toxicity.lethal_dosage.ld50", entries)}
          />

          <OrganToxicityArrayEditor
            entries={organToxicityEntries}
            onChange={(entries) => setValue("harm_potential.toxicity.organ_toxicity", entries)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-carc-level`}>Carcinogenicity Level</Label>
              <Select
                value={carcinogenicityLevel ?? ""}
                onValueChange={(nextValue) => setValue(
                  "harm_potential.toxicity.carcinogenicity.level",
                  nextValue === "" ? null : (nextValue as CarcinogenicityLevel),
                )}
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

      <CollapsibleSubsection
        title="Risks"
        icon={<Icon icon="streamline:dangerous-zone-sign-remix" className="h-5 w-5" size={20} />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-psychosis-level`}>Psychosis Risk</Label>
            <RiskLevelSelect
              id={`${idPrefix}-psychosis-level`}
              value={psychosisLevel}
              onChange={(nextValue) => setValue("harm_potential.psychosis.level", nextValue)}
            />
            <Textarea
              id={`${idPrefix}-psychosis-desc`}
              className="min-h-[60px]"
              {...register("harm_potential.psychosis.description")}
              placeholder="Describe psychosis risk factors."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-seizure-level`}>Seizure Risk</Label>
            <RiskLevelSelect
              id={`${idPrefix}-seizure-level`}
              value={seizureLevel}
              onChange={(nextValue) => setValue("harm_potential.seizure.level", nextValue)}
            />
            <Textarea
              id={`${idPrefix}-seizure-desc`}
              className="min-h-[60px]"
              {...register("harm_potential.seizure.description")}
              placeholder="Describe seizure threshold effects."
            />
          </div>
        </div>
      </CollapsibleSubsection>
    </section>
  );
}
