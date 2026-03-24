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

import { CollapsibleSubsection } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
import { SectionGenerator } from "../tools/substance-editor/SectionGenerator";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { parseSectionYamlObject } from "../tools/substance-editor/yamlParser";
import type { TagOption } from "@/data/config/tagOptions";
import type { SubstanceArticle, Pharmacology, DosageRoute, DurationRoute } from "@/schema";
import {
  normalizePharmacologySection,
  normalizeRouteName,
} from "../../../../lib/article/normalization.js";

function normalizeRouteRecord(routeValues?: Record<string, string>) {
  return routeValues ?? {};
}

// ============================================================================
// Blank Route Creation Helpers
// ============================================================================

/** Create a blank dosage route with bioavailability and notes pre-filled */
function createBlankDosageRoute(
  routeName: string,
  bioavailability: string = "",
  bioavailabilityNotes: string = ""
): DosageRoute {
  return {
    route: routeName,
    bioavailability: bioavailability,
    bioavailability_notes: bioavailabilityNotes,
    dose_ranges: {
      threshold: { min: null, max: null, unit: "" },
      light: { min: null, max: null, unit: "" },
      moderate: { min: null, max: null, unit: "" },
      strong: { min: null, max: null, unit: "" },
      heavy: { min: null, max: null, unit: "" },
    },
    notes: "",
  };
}

/** Create a blank duration route with half-life pre-filled */
function createBlankDurationRoute(
  routeName: string,
  halfLife: string = "",
  halfLifeNotes: string = ""
): DurationRoute {
  return {
    route: routeName,
    half_life: halfLife,
    half_life_notes: halfLifeNotes,
    stages: {
      onset: { min: null, max: null, unit: "" },
      come_up: { min: null, max: null, unit: "" },
      peak: { min: null, max: null, unit: "" },
      offset: { min: null, max: null, unit: "" },
      after_effects: { min: null, max: null, unit: "" },
      total_duration: { min: null, max: null, unit: "" },
    },
  };
}

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
      const parsed = parseSectionYamlObject<Record<string, unknown>>(generatedYaml);
      const pharmacology: Pharmacology & {
        summary?: string;
        route_bioavailability?: Record<string, string>;
        route_half_life?: Record<string, string>;
        route_half_life_notes?: Record<string, string>;
        route_bioavailability_notes?: Record<string, string>;
        bioavailability_notes?: string;
        half_life?: string;
      } = normalizePharmacologySection(parsed.pharmacology ?? parsed);
      
      setValue("pharmacology.pharmacodynamics", pharmacology.pharmacodynamics ?? pharmacology.summary ?? "");
      setValue("pharmacology.summary", pharmacology.summary ?? "");
      setValue("pharmacology.receptor_profile", pharmacology.receptor_profile ?? []);
      setValue("pharmacology.pharmacokinetics", pharmacology.pharmacokinetics ?? "");
      setValue("pharmacology.metabolites", pharmacology.metabolites ?? []);
      setValue("pharmacology.protein_binding", pharmacology.protein_binding ?? "");
      setValue("pharmacology.volume_of_distribution", pharmacology.volume_of_distribution ?? "");
      setValue("pharmacology.route_bioavailability", normalizeRouteRecord(pharmacology.route_bioavailability));
      setValue("pharmacology.route_half_life", normalizeRouteRecord(pharmacology.route_half_life));
      setValue("pharmacology.route_half_life_notes", normalizeRouteRecord(pharmacology.route_half_life_notes));
      setValue("pharmacology.route_bioavailability_notes", normalizeRouteRecord(pharmacology.route_bioavailability_notes));
      setValue("pharmacology.bioavailability_notes", pharmacology.bioavailability_notes ?? "");
      setValue("pharmacology.half_life", pharmacology.half_life ?? "");
      
      const routeBioMap = normalizeRouteRecord(pharmacology.route_bioavailability);
      const routeHalfLifeMap = normalizeRouteRecord(pharmacology.route_half_life);
      const routeHalfLifeNotesMap = normalizeRouteRecord(pharmacology.route_half_life_notes);
      const routeBioNotesMap = normalizeRouteRecord(pharmacology.route_bioavailability_notes);
      
      // Check if we have any route-specific data to apply
      const hasRouteData = 
        Object.keys(routeBioMap).length > 0 ||
        Object.keys(routeHalfLifeMap).length > 0 ||
        Object.keys(routeHalfLifeNotesMap).length > 0 ||
        Object.keys(routeBioNotesMap).length > 0;
      
      if (hasRouteData) {
        const currentDosageRoutes = getValues("dosage.routes") ?? [];
        const currentDurationRoutes = getValues("duration.routes") ?? [];
        
        // Track which canonical routes already exist in the form
        const existingRoutes = new Set(
          currentDosageRoutes.map((r) => normalizeRouteName(r.route))
        );
        
        // 1. Apply route-specific data to existing routes
        currentDosageRoutes.forEach((route, index) => {
          const normalizedRoute = normalizeRouteName(route.route);
          if (routeBioMap[normalizedRoute]) {
            setValue(`dosage.routes.${index}.bioavailability`, routeBioMap[normalizedRoute]);
          }
          if (routeBioNotesMap[normalizedRoute]) {
            setValue(`dosage.routes.${index}.bioavailability_notes`, routeBioNotesMap[normalizedRoute]);
          }
        });
        
        currentDurationRoutes.forEach((route, index) => {
          const normalizedRoute = normalizeRouteName(route.route);
          if (routeHalfLifeMap[normalizedRoute]) {
            setValue(`duration.routes.${index}.half_life`, routeHalfLifeMap[normalizedRoute]);
          }
          if (routeHalfLifeNotesMap[normalizedRoute]) {
            setValue(`duration.routes.${index}.half_life_notes`, routeHalfLifeNotesMap[normalizedRoute]);
          }
        });
        
        // 2. Collect all unique routes from all four maps that don't exist yet
        const allNewRoutes = new Set<string>();
        for (const routeName of Object.keys(routeBioMap)) {
          if (!existingRoutes.has(routeName)) allNewRoutes.add(routeName);
        }
        for (const routeName of Object.keys(routeHalfLifeMap)) {
          if (!existingRoutes.has(routeName)) allNewRoutes.add(routeName);
        }
        for (const routeName of Object.keys(routeHalfLifeNotesMap)) {
          if (!existingRoutes.has(routeName)) allNewRoutes.add(routeName);
        }
        for (const routeName of Object.keys(routeBioNotesMap)) {
          if (!existingRoutes.has(routeName)) allNewRoutes.add(routeName);
        }
        
        // 3. Create new blank routes for any routes with data that don't exist yet
        if (allNewRoutes.size > 0) {
          const newDosageRoutes = [...currentDosageRoutes];
          const newDurationRoutes = [...currentDurationRoutes];
          
          for (const routeName of allNewRoutes) {
            const bioavailability = routeBioMap[routeName] ?? "";
            const bioavailabilityNotes = routeBioNotesMap[routeName] ?? "";
            const halfLife = routeHalfLifeMap[routeName] ?? "";
            const halfLifeNotes = routeHalfLifeNotesMap[routeName] ?? "";
            
            newDosageRoutes.push(createBlankDosageRoute(routeName, bioavailability, bioavailabilityNotes));
            newDurationRoutes.push(createBlankDurationRoute(routeName, halfLife, halfLifeNotes));
          }
          
          setValue("dosage.routes", newDosageRoutes);
          setValue("duration.routes", newDurationRoutes);
        }
      }
    } catch (error) {
      console.error("Failed to parse generated pharmacology YAML:", error);
    }
  }, [setValue, getValues]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Pharmacology"
          sectionKey="pharmacology"
          prompt={pharmacologyPrompt}
          extractedContent={articlesContext.pharmacologyQuotes}
          extractedSources={articlesContext.pharmacologySources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          applyNote="Bioavailability & half-life data will be inserted into dosage/duration tables"
          substanceSlug={articlesContext.selectedSubstanceSlug}
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

      {/* Receptor Profile (combined MoA + binding) — edited via YAML paste */}
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
          <Icon icon="fluent:brain-circuit-28-filled" className="h-4 w-4 text-white/60" size={16} />
          Receptor Profile
        </p>
        <div className="space-y-3">
          {receptorProfile.fields.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
              No receptor entries yet.
            </div>
          )}
          {receptorProfile.fields.map((field, index) => (
            <div key={field.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
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
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="destructivePill"
                  size="pill"
                  onClick={() => receptorProfile.remove(index)}
                >
                  <Icon icon="lucide:trash-2" className="h-4 w-4" size={16} />
                  Remove Entry
                </Button>
              </div>
            </div>
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
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
        <Icon icon="material-symbols:metabolism-rounded" className="h-3.5 w-3.5" size={14} />
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
