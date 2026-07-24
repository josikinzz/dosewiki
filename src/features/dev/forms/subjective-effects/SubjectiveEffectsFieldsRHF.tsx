/**
 * SubjectiveEffectsFieldsRHF - Main form component for editing subjective effects.
 * Provides a nested subsection structure similar to HistoryCultureFieldsRHF.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { Icon, type IconName } from "@/components/common/Icon";
import { SENSORY_CATEGORIES } from "@/data/subjectiveEffectSubcategories";
import yaml from "yaml";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { ArticleSectionGenerator } from "../ArticleSectionGenerator";
import { CollapsibleSubsection } from "../FormHelpers";
import { useOptionalSubstanceEditorContext } from "../../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { icons } from "@/utils/iconNames";
import { parseSectionYamlObject } from "../../tools/substance-editor/yamlParser";
import { EffectCategoryCard } from "./EffectCategoryCard";
import { SenseCategoryCard, type SenseType } from "./SenseCategoryCard";
import { AttributionEditor } from "./AttributionEditor";
import type { SubstanceArticle, SubjectiveEffects } from "@/schema";

// Sensory categories configuration (shared with the public article renderer)
const SENSORY_SENSES: Array<{ sense: SenseType; label: string; icon?: IconName }> =
  SENSORY_CATEGORIES.map(({ key, label, icon }) => ({
    sense: key as SenseType,
    label,
    icon: icon ?? undefined,
  }));

export interface SubjectiveEffectsFieldsRHFProps {
  idPrefix: string;
}

export function SubjectiveEffectsFieldsRHF({ idPrefix }: SubjectiveEffectsFieldsRHFProps) {
  const { register, getValues, setValue } = useFormContext<SubstanceArticle>();

  // Get articles context if available (only in Articles tab)
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: subjectiveEffectsPrompt } = useSectionPrompt("subjective_effects");

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated subjective effects YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = parseSectionYamlObject<Record<string, unknown>>(generatedYaml);
      const subjectiveEffects = (parsed.subjective_effects ?? parsed) as Partial<SubjectiveEffects>;
      
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
        <ArticleSectionGenerator
          sectionLabel="Subjective Effects"
          sectionKey="subjective_effects"
          prompt={subjectiveEffectsPrompt}
          extractedContent={null}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          disabled
          disabledMessage="Coming soon"
        />
      )}

      {/* Overview Note */}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-notes-overview`} className="inline-flex items-center gap-1.5">
          <Icon icon={icons.subjectiveEffectIndex} className="theme-accent-emphasis h-3.5 w-3.5" size={14} />
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
        icon="lucide:hand"
        idPrefix={idPrefix}
        noteFieldPath="subjective_effects.notes.physical"
      />

      {/* Cognitive Effects */}
      <EffectCategoryCard
        fieldPath="subjective_effects.cognitive"
        title="Cognitive Effects"
        icon="fluent:thinking-24-regular"
        idPrefix={idPrefix}
        noteFieldPath="subjective_effects.notes.cognitive"
      />

      {/* Sensory Effects (collapsible container with 6 senses) */}
      <CollapsibleSubsection title="Sensory Effects" icon={<Icon icon="line-md:watch-loop" className="h-5 w-5" size={20} />}>
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
        icon="lucide:list-ordered"
        idPrefix={idPrefix}
        optional
      />

      {/* Attribution */}
      <AttributionEditor idPrefix={idPrefix} />
    </section>
  );
}
