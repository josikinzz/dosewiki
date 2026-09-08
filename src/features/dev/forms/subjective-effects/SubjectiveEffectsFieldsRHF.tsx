/**
 * SubjectiveEffectsFieldsRHF - Main form component for editing subjective effects.
 * Provides a nested subsection structure similar to HistoryCultureFieldsRHF.
 */

import { useFormContext } from "react-hook-form";
import { Icon, type IconName } from "@/components/common/Icon";
import { SENSORY_CATEGORIES } from "@/data/subjectiveEffectSubcategories";

import { Textarea } from "@/components/ui/textarea";
import { FormEditorField } from "../FormEditorField";

import { CollapsibleSubsection } from "../FormHelpers";
import { icons } from "@/utils/iconNames";
import { EffectCategoryCard } from "./EffectCategoryCard";
import { SenseCategoryCard, type SenseType } from "./SenseCategoryCard";
import { AttributionEditor } from "./AttributionEditor";
import type { SubstanceArticle } from "@/schema";

// Sensory categories configuration (shared with the public article renderer)
const SENSORY_SENSES: Array<{ sense: SenseType; label: string; icon?: IconName }> =
  SENSORY_CATEGORIES.map(({ key, label, icon }) => ({
    sense: key as SenseType,
    label,
    icon: icon ?? undefined,
  }));

export interface SubjectiveEffectsFieldsRHFProps {
  idPrefix: string;
  pairedIndicator?: boolean;
}

export function SubjectiveEffectsFieldsRHF({ idPrefix, pairedIndicator = false }: SubjectiveEffectsFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
      {/* Overview Note */}
      <FormEditorField
        name="subjective_effects.notes.overview"
        htmlFor={`${idPrefix}-notes-overview`}
        label={
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={icons.subjectiveEffectIndex} className="theme-accent-emphasis h-3.5 w-3.5" size={14} />
            Effects Overview
          </span>
        }
      >
        <Textarea
          id={`${idPrefix}-notes-overview`}
          className="min-h-[100px]"
          {...register("subjective_effects.notes.overview")}
          placeholder="2-4 sentences describing the overall subjective experience..."
        />
      </FormEditorField>

      {/* Physical Effects */}
      <EffectCategoryCard
        fieldPath="subjective_effects.physical"
        title="Physical Effects"
        icon="lucide:hand"
        idPrefix={idPrefix}
        pairedIndicator={pairedIndicator}
        noteFieldPath="subjective_effects.notes.physical"
      />

      {/* Cognitive Effects */}
      <EffectCategoryCard
        fieldPath="subjective_effects.cognitive"
        title="Cognitive Effects"
        icon="fluent:thinking-24-regular"
        idPrefix={idPrefix}
        pairedIndicator={pairedIndicator}
        noteFieldPath="subjective_effects.notes.cognitive"
      />

      {/* Sensory Effects (collapsible container with 6 senses) */}
      <CollapsibleSubsection title="Sensory Effects" pairedIndicator={pairedIndicator} icon={<Icon icon="lucide:eye" className="h-5 w-5" size={20} />}>
        {/* Sensory Note at top of section */}
        <FormEditorField
          htmlFor={`${idPrefix}-notes-sensory`}
          label="Sensory Note"
          name="subjective_effects.notes.sensory"
        >
          <Textarea
            id={`${idPrefix}-notes-sensory`}
            className="min-h-[80px]"
            {...register("subjective_effects.notes.sensory")}
            placeholder="Brief qualitative description of sensory effects..."
          />
        </FormEditorField>

        {SENSORY_SENSES.map(({ sense, label, icon }) => (
          <SenseCategoryCard
            key={sense}
            sense={sense}
            label={label}
            icon={icon}
            idPrefix={idPrefix}
            pairedIndicator={pairedIndicator}
          />
        ))}
      </CollapsibleSubsection>

      {/* Progressive Stages (optional) */}
      <EffectCategoryCard
        fieldPath="subjective_effects.progressive_stages"
        title="Progressive Stages"
        icon="lucide:list-ordered"
        idPrefix={idPrefix}
        pairedIndicator={pairedIndicator}
        optional
      />

      {/* Attribution */}
      <AttributionEditor idPrefix={idPrefix} pairedIndicator={pairedIndicator} />
    </section>
  );
}
