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
import type { SubstanceArticle, Pharmacology, DosageRoute, DurationRoute } from "../../../schema";

// ============================================================================
// Route Name Normalization
// ============================================================================

/** Maps various route name variations to canonical route names */
const ROUTE_ALIASES: Record<string, string> = {
  "oral": "Oral",
  "insufflated": "Insufflated",
  "intranasal": "Insufflated",
  "snorted": "Insufflated",
  "sublingual": "Sublingual",
  "buccal": "Sublingual",
  "smoked": "Smoked",
  "inhalation": "Smoked",
  "vaporized": "Vaporized",
  "vaporised": "Vaporized",
  "intravenous": "Intravenous",
  "iv": "Intravenous",
  "intramuscular": "Intramuscular",
  "im": "Intramuscular",
  "rectal": "Rectal",
  "plugged": "Rectal",
};

/** Normalize a route name to its canonical form */
function normalizeRouteName(route: string): string {
  if (!route) return "";
  const lower = route.toLowerCase().trim();
  return ROUTE_ALIASES[lower] ?? route;
}

/** Normalize the route_bioavailability object keys to canonical route names */
function normalizeRouteBioavailability(
  routeBio: Record<string, string>
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [route, value] of Object.entries(routeBio)) {
    const canonicalRoute = normalizeRouteName(route);
    normalized[canonicalRoute] = value;
  }
  return normalized;
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
  // Always overwrites pharmacology fields - use empty defaults for missing fields
  // Also applies route-specific fields to dosage/duration routes (creates new routes if needed)
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = yaml.parse(generatedYaml);
      const pharmacology: Pharmacology & {
        route_bioavailability?: Record<string, string>;
        route_half_life?: Record<string, string>;
        route_half_life_notes?: Record<string, string>;
        route_bioavailability_notes?: Record<string, string>;
      } = parsed.pharmacology ?? parsed;
      
      // Apply pharmacology fields (always overwrite with empty defaults for missing)
      setValue("pharmacology.mechanism_of_action", pharmacology.mechanism_of_action ?? []);
      setValue("pharmacology.receptor_binding", pharmacology.receptor_binding ?? {});
      setValue("pharmacology.metabolism", pharmacology.metabolism ?? "");
      setValue("pharmacology.metabolites", pharmacology.metabolites ?? []);
      
      // Normalize all route-specific maps
      const routeBioMap = pharmacology.route_bioavailability
        ? normalizeRouteBioavailability(pharmacology.route_bioavailability)
        : {};
      const routeHalfLifeMap = pharmacology.route_half_life
        ? normalizeRouteBioavailability(pharmacology.route_half_life)
        : {};
      const routeHalfLifeNotesMap = pharmacology.route_half_life_notes
        ? normalizeRouteBioavailability(pharmacology.route_half_life_notes)
        : {};
      const routeBioNotesMap = pharmacology.route_bioavailability_notes
        ? normalizeRouteBioavailability(pharmacology.route_bioavailability_notes)
        : {};
      
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
      
      {/* Extended pharmacokinetics - stored but not displayed in public section */}
      <CollapsibleSubsection
        title="Extended Pharmacokinetics"
        icon={<Timer className="h-5 w-5" />}
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
