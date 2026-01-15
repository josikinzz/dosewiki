/**
 * SubjectiveEffectsFieldsRHF - Main form component for editing subjective effects.
 * Provides a nested subsection structure similar to HistoryCultureFieldsRHF.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import {
  Sparkles,
  Brain,
  Hand,
  Eye,
  Ear,
  ListOrdered,
} from "lucide-react";
import yaml from "yaml";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { CollapsibleSubsection } from "../FormHelpers";
import { SectionGenerator } from "../../tools/articles/SectionGenerator";
import { useOptionalArticlesContext } from "../../tools/articles/ArticlesContext";
import { subjectiveEffectsPrompt } from "../../../../data/config/sectionPrompts";
import { EffectCategoryCard } from "./EffectCategoryCard";
import { SenseCategoryCard, type SenseType } from "./SenseCategoryCard";
import { AttributionEditor } from "./AttributionEditor";
import type { SubstanceArticle, SubjectiveEffects } from "../../../../schema";

// Sensory categories configuration
const SENSORY_SENSES: Array<{ sense: SenseType; label: string; icon?: typeof Eye }> = [
  { sense: "visual", label: "Visual", icon: Eye },
  { sense: "auditory", label: "Auditory", icon: Ear },
  { sense: "tactile", label: "Tactile", icon: Hand },
  { sense: "olfactory", label: "Olfactory" },
  { sense: "gustatory", label: "Gustatory" },
  { sense: "multisensory", label: "Multisensory" },
];

export interface SubjectiveEffectsFieldsRHFProps {
  idPrefix: string;
}

export function SubjectiveEffectsFieldsRHF({ idPrefix }: SubjectiveEffectsFieldsRHFProps) {
  const { register, getValues, setValue } = useFormContext<SubstanceArticle>();

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

  // Strip markdown code fences from LLM output
  const stripCodeFences = (text: string): string => {
    return text
      .replace(/^```(?:yaml|yml)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
  };

  // Handle applying generated subjective effects YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const cleanYaml = stripCodeFences(generatedYaml);
      const parsed = yaml.parse(cleanYaml);
      const subjectiveEffects: SubjectiveEffects = parsed.subjective_effects ?? parsed;
      
      // Apply notes
      if (subjectiveEffects.notes) {
        setValue("subjective_effects.notes.overview", subjectiveEffects.notes.overview ?? "");
        setValue("subjective_effects.notes.sensory", subjectiveEffects.notes.sensory ?? "");
        setValue("subjective_effects.notes.cognitive", subjectiveEffects.notes.cognitive ?? "");
        setValue("subjective_effects.notes.physical", subjectiveEffects.notes.physical ?? "");
      }
      
      // Apply sensory effects
      if (subjectiveEffects.sensory) {
        for (const sense of SENSORY_SENSES) {
          const senseData = subjectiveEffects.sensory[sense.sense];
          if (senseData) {
            setValue(`subjective_effects.sensory.${sense.sense}.note`, senseData.note ?? "");
            setValue(`subjective_effects.sensory.${sense.sense}.subcategories`, senseData.subcategories ?? {});
          }
        }
      }
      
      // Apply cognitive effects
      if (subjectiveEffects.cognitive) {
        setValue("subjective_effects.cognitive", subjectiveEffects.cognitive);
      }
      
      // Apply physical effects
      if (subjectiveEffects.physical) {
        setValue("subjective_effects.physical", subjectiveEffects.physical);
      }
      
      // Apply progressive stages if present
      if (subjectiveEffects.progressive_stages) {
        setValue("subjective_effects.progressive_stages", subjectiveEffects.progressive_stages);
      }
      
      // Apply attribution if present
      if (subjectiveEffects.attribution) {
        setValue("subjective_effects.attribution.author", subjectiveEffects.attribution.author ?? "");
        setValue("subjective_effects.attribution.text", subjectiveEffects.attribution.text ?? "");
        setValue("subjective_effects.attribution.url", subjectiveEffects.attribution.url ?? "");
      }
    } catch (error) {
      console.error("Failed to parse generated subjective effects YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Subjective Effects"
          sectionKey="subjective_effects"
          prompt={subjectiveEffectsPrompt}
          extractedContent={null}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          disabled
          disabledMessage="Coming soon"
          substanceSlug={articlesContext.selectedSubstanceSlug}
        />
      )}

      {/* Overview Note */}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-notes-overview`} className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
          Effects Overview
        </Label>
        <Textarea
          id={`${idPrefix}-notes-overview`}
          className="min-h-[100px]"
          {...register("subjective_effects.notes.overview")}
          placeholder="2-4 sentences describing the overall subjective experience..."
        />
      </div>

      {/* Physical Effects */}
      <EffectCategoryCard
        fieldPath="subjective_effects.physical"
        title="Physical Effects"
        icon={Hand}
        idPrefix={idPrefix}
        noteFieldPath="subjective_effects.notes.physical"
      />

      {/* Cognitive Effects */}
      <EffectCategoryCard
        fieldPath="subjective_effects.cognitive"
        title="Cognitive Effects"
        icon={Brain}
        idPrefix={idPrefix}
        noteFieldPath="subjective_effects.notes.cognitive"
      />

      {/* Sensory Effects (collapsible container with 6 senses) */}
      <CollapsibleSubsection title="Sensory Effects" icon={<Eye className="h-5 w-5" />}>
        {/* Sensory Note at top of section */}
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-notes-sensory`}>Sensory Note</Label>
          <Textarea
            id={`${idPrefix}-notes-sensory`}
            className="min-h-[80px]"
            {...register("subjective_effects.notes.sensory")}
            placeholder="Brief qualitative description of sensory effects..."
          />
        </div>

        {SENSORY_SENSES.map(({ sense, label, icon }) => (
          <SenseCategoryCard
            key={sense}
            sense={sense}
            label={label}
            icon={icon}
            idPrefix={idPrefix}
          />
        ))}
      </CollapsibleSubsection>

      {/* Progressive Stages (optional) */}
      <EffectCategoryCard
        fieldPath="subjective_effects.progressive_stages"
        title="Progressive Stages"
        icon={ListOrdered}
        idPrefix={idPrefix}
        optional
      />

      {/* Attribution */}
      <AttributionEditor idPrefix={idPrefix} />
    </section>
  );
}
