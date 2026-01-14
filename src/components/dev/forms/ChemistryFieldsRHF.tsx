/**
 * RHF-based Pharmacology fields component.
 * Classification fields have been moved to ClassificationFieldsRHF.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { Brain, FlaskConical, Timer } from "lucide-react";
import yaml from "yaml";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { CollapsibleSubsection } from "./FormHelpers";
import { ControlledTagMultiSelect, RecordStringInput } from "./rhf";
import { SectionGenerator } from "../tools/articles/SectionGenerator";
import { useOptionalArticlesContext } from "../tools/articles/ArticlesContext";
import { pharmacologyPrompt } from "../../../data/config/sectionPrompts";
import type { TagOption } from "../../../data/config/tagOptions";
import type { SubstanceArticle, Pharmacology } from "../../../schema";

export type ChemistryFieldsRHFProps = {
  idPrefix: string;
  mechanismOptions: TagOption[];
};

export function ChemistryFieldsRHF({
  idPrefix,
  mechanismOptions,
}: ChemistryFieldsRHFProps) {
  const { register, setValue, getValues } = useFormContext<SubstanceArticle>();
  
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

  // Handle applying generated pharmacology YAML to form
  // Always overwrites all fields - use empty defaults for missing fields
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const pharmacology: Pharmacology = parsed.pharmacology ?? parsed;
      
      // Always overwrite - use empty defaults for missing fields
      setValue("pharmacology.mechanism_of_action", pharmacology.mechanism_of_action ?? []);
      setValue("pharmacology.receptor_binding", pharmacology.receptor_binding ?? {});
      setValue("pharmacology.metabolism", pharmacology.metabolism ?? "");
      setValue("pharmacology.metabolites", pharmacology.metabolites ?? []);
      setValue("pharmacology.half_life", pharmacology.half_life ?? "");
      setValue("pharmacology.bioavailability_notes", pharmacology.bioavailability_notes ?? "");
    } catch (error) {
      console.error("Failed to parse generated pharmacology YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Pharmacology"
          prompt={pharmacologyPrompt}
          extractedContent={articlesContext.pharmacologyQuotes}
          extractedSources={articlesContext.pharmacologySources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
        />
      )}
      
      {/* Mechanism of Action - Primary card in public section */}
      <div className="space-y-1">
        <ControlledTagMultiSelect
          name="pharmacology.mechanism_of_action"
          label="Mechanism of Action"
          icon={<Brain className="h-4 w-4 text-white/60" />}
          placeholder="Add mechanism"
          options={mechanismOptions}
          addButtonLabel="Add mechanism"
          openStrategy="button"
        />
      </div>
      
      {/* Receptor Binding - Expandable within MoA card */}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-receptor-binding`}>
          Receptor Binding Profile
        </Label>
        <RecordStringInput
          name="pharmacology.receptor_binding"
          className="min-h-[80px]"
          placeholder="receptor: affinity (one per line, e.g., 5-HT2A: Ki = 0.3 nM)"
        />
      </div>
      
      {/* Metabolism & Metabolites - Second card in public section */}
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
        <FlaskConical className="h-3.5 w-3.5" />
        Metabolism
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-metabolism`}>
            Metabolism Pathway
          </Label>
          <Textarea
            id={`${idPrefix}-metabolism`}
            className="min-h-[80px]"
            {...register("pharmacology.metabolism")}
            placeholder="Describe metabolic pathway (e.g., CYP2D6, CYP3A4 hepatic metabolism)"
          />
        </div>
        <div className="space-y-1">
          <ControlledTagMultiSelect
            name="pharmacology.metabolites"
            label="Active Metabolites"
            placeholder="Add metabolite"
            options={[]}
            addButtonLabel="Add metabolite"
            openStrategy="focus"
          />
        </div>
      </div>
      
      {/* Half-life & Bioavailability Notes - Third card in public section */}
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
        <Timer className="h-3.5 w-3.5" />
        Half-life & Bioavailability
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-half-life`}>
            Half-life
          </Label>
          <Input
            id={`${idPrefix}-half-life`}
            {...register("pharmacology.half_life")}
            placeholder="e.g., ~3.6 hours"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-bioavailability-notes`}>
            Bioavailability Notes
          </Label>
          <Textarea
            id={`${idPrefix}-bioavailability-notes`}
            className="min-h-[60px]"
            {...register("pharmacology.bioavailability_notes")}
            placeholder="Notes on absorption, food effects, or route-specific considerations."
          />
        </div>
      </div>
      
      {/* Extended pharmacokinetics - stored but not displayed in public section */}
      <CollapsibleSubsection
        title="Extended Pharmacokinetics"
        icon={<Timer className="h-5 w-5" />}
        description="These fields are stored for data completeness but not currently displayed in the public article."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-bioavailability`}>
              Bioavailability
            </Label>
            <Input
              id={`${idPrefix}-bioavailability`}
              {...register("pharmacology.bioavailability")}
              placeholder="e.g., 70% (oral)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-protein-binding`}>
              Protein Binding
            </Label>
            <Input
              id={`${idPrefix}-protein-binding`}
              {...register("pharmacology.protein_binding")}
              placeholder="e.g., 80-85%"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-volume-distribution`}>
              Volume of Distribution
            </Label>
            <Input
              id={`${idPrefix}-volume-distribution`}
              {...register("pharmacology.volume_of_distribution")}
              placeholder="e.g., 1.2 L/kg"
            />
          </div>
        </div>
      </CollapsibleSubsection>
    </section>
  );
}
