/**
 * RHF-based Pharmacology fields component.
 * Classification fields have been moved to ClassificationFieldsRHF.
 */

import { useCallback } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import yaml from "yaml";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyStateSurface } from "@/components/ui/surface";

import { ArticleSectionGenerator } from "./ArticleSectionGenerator";
import { EntryCard } from "./EntryCard";
import { CollapsibleSubsection } from "./FormHelpers";
import { applyGeneratedPharmacology } from "./pharmacologyApplyGenerated";
import { ControlledTagMultiSelect } from "./rhf";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import type { TagOption } from "@/data/config/tagOptions";
import type { SubstanceArticle } from "@/schema";

export type ChemistryFieldsRHFProps = {
  idPrefix: string;
  mechanismOptions: TagOption[];
};

export function ChemistryFieldsRHF({
  idPrefix,
  mechanismOptions: _mechanismOptions,
}: ChemistryFieldsRHFProps) {
  const { register, setValue, getValues, control } = useFormContext<SubstanceArticle>();
  const receptorProfile = useFieldArray({
    control,
    name: "pharmacology.receptor_profile",
  });

  // Get articles context if available (only in Articles tab)
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: pharmacologyPrompt } = useSectionPrompt("pharmacology");

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
  // Always overwrites pharmacology fields - use empty defaults for missing fields
  // Also applies route-specific fields to dosage/duration routes (creates new routes if needed)
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const nextValues = applyGeneratedPharmacology(
        generatedYaml,
        getValues("dosage.routes") ?? [],
        getValues("duration.routes") ?? [],
      );

      setValue("pharmacology.pharmacodynamics", nextValues.pharmacology.pharmacodynamics);
      setValue("pharmacology.summary", nextValues.pharmacology.summary);
      setValue("pharmacology.receptor_profile", nextValues.pharmacology.receptor_profile);
      setValue("pharmacology.pharmacokinetics", nextValues.pharmacology.pharmacokinetics);
      setValue("pharmacology.metabolites", nextValues.pharmacology.metabolites);
      setValue("pharmacology.protein_binding", nextValues.pharmacology.protein_binding);
      setValue("pharmacology.volume_of_distribution", nextValues.pharmacology.volume_of_distribution);
      setValue("pharmacology.route_bioavailability", nextValues.pharmacology.route_bioavailability);
      setValue("pharmacology.route_half_life", nextValues.pharmacology.route_half_life);
      setValue("pharmacology.route_half_life_notes", nextValues.pharmacology.route_half_life_notes);
      setValue("pharmacology.route_bioavailability_notes", nextValues.pharmacology.route_bioavailability_notes);
      setValue("pharmacology.bioavailability_notes", nextValues.pharmacology.bioavailability_notes);
      setValue("pharmacology.half_life", nextValues.pharmacology.half_life);
      setValue("dosage.routes", nextValues.dosageRoutes);
      setValue("duration.routes", nextValues.durationRoutes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply generated pharmacology YAML.";
      console.error("[PharmacologyGenerator] apply-failed", {
        inputChars: generatedYaml.length,
        preview: generatedYaml.slice(0, 500),
        error: message,
      });
      throw error instanceof Error ? error : new Error(message);
    }
  }, [setValue, getValues]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <ArticleSectionGenerator
          sectionLabel="Pharmacology"
          sectionKey="pharmacology"
          prompt={pharmacologyPrompt}
          extractedContent={articlesContext.pharmacologyQuotes}
          extractedSources={articlesContext.pharmacologySources}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          applyNote="Bioavailability & half-life data will be inserted into dosage/duration tables"
          quoteSection="pharmacology"
        />
      )}
      
      {/* Pharmacodynamics */}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-pharmacology-pharmacodynamics`}>
          Pharmacodynamics
        </Label>
        <Textarea
          id={`${idPrefix}-pharmacology-pharmacodynamics`}
          className="min-h-[80px]"
          {...register("pharmacology.pharmacodynamics")}
          placeholder="Plain-language pharmacodynamics overview"
        />
      </div>

      {/* Receptor affinities (combined MoA + binding) edited via YAML paste */}
      <div className="space-y-3">
        <p className="theme-text-faint flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
          <Icon icon="fluent:brain-circuit-28-filled" className="theme-icon-accent h-4 w-4" size={16} />
          Receptor Affinities
        </p>
        <div className="space-y-3">
          {receptorProfile.fields.length === 0 && (
            <EmptyStateSurface padding="sm" radius="lg" className="text-sm">
              No receptor entries yet.
            </EmptyStateSurface>
          )}
          {receptorProfile.fields.map((field, index) => (
            <EntryCard
              key={field.id}
              title={`Receptor ${index + 1}`}
              onRemove={() => receptorProfile.remove(index)}
              removeLabel={`Remove receptor entry ${index + 1}`}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor={`${idPrefix}-receptor-${index}`}>Receptor</Label>
                  <Input
                    id={`${idPrefix}-receptor-${index}`}
                    {...register(`pharmacology.receptor_profile.${index}.receptor`)}
                    placeholder="e.g. 5-HT2A"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${idPrefix}-tag-${index}`}>Mechanism Tag</Label>
                  <Input
                    id={`${idPrefix}-tag-${index}`}
                    {...register(`pharmacology.receptor_profile.${index}.tag`)}
                    placeholder="e.g. 5-HT2A receptor agonist"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${idPrefix}-affinity-${index}`}>Affinity</Label>
                  <Input
                    id={`${idPrefix}-affinity-${index}`}
                    {...register(`pharmacology.receptor_profile.${index}.affinity`)}
                    placeholder="e.g. Ki = 2.9 nM"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${idPrefix}-efficacy-${index}`}>Efficacy / Notes</Label>
                  <Input
                    id={`${idPrefix}-efficacy-${index}`}
                    {...register(`pharmacology.receptor_profile.${index}.efficacy`)}
                    placeholder="e.g. partial agonist"
                  />
                </div>
              </div>
            </EntryCard>
          ))}
          <Button
            type="button"
            variant="glass"
            size="pill"
            onClick={() => receptorProfile.append({ receptor: "", tag: "", affinity: "", efficacy: "" })}
          >
            <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
            Add Receptor Entry
          </Button>
        </div>
      </div>

      {/* Pharmacokinetics & Metabolites */}
      <p className="theme-text-faint flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
        <Icon icon="material-symbols:metabolism-rounded" className="theme-icon-accent h-3.5 w-3.5" size={14} />
        Pharmacokinetics
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-pharmacokinetics`}>
            Pharmacokinetics
          </Label>
          <Textarea
            id={`${idPrefix}-pharmacokinetics`}
            className="min-h-[80px]"
            {...register("pharmacology.pharmacokinetics")}
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
      
      {/* Extended pharmacokinetics - stored but not displayed in public section */}
      <CollapsibleSubsection
        title="Extended Pharmacokinetics"
        icon={<Icon icon="lucide:timer" className="h-5 w-5" size={20} />}
        description="These fields are stored for data completeness but not currently displayed in the public article."
      >
        <div className="grid gap-4 md:grid-cols-2">
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
