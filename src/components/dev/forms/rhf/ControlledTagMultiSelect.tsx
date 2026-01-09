/**
 * Controller wrapper for TagMultiSelect to integrate with React Hook Form.
 */

import { Controller, useFormContext, type FieldPath } from "react-hook-form";

import { TagMultiSelect, type TagMultiSelectProps } from "../../../common/TagMultiSelect";
import type { SubstanceArticle } from "../../../../schema";

type ArrayFieldPath = FieldPath<SubstanceArticle> & (
  | "index_categories"
  | "identification.alternative_names"
  | "classification.psychoactive_class"
  | "classification.chemical_class"
  | "pharmacology.mechanism_of_action"
  | "pharmacology.metabolites"
  | "subjective_effects.sensory.visual"
  | "subjective_effects.sensory.auditory"
  | "subjective_effects.sensory.tactile"
  | "subjective_effects.sensory.olfactory"
  | "subjective_effects.sensory.gustatory"
  | "subjective_effects.sensory.multisensory"
  | "subjective_effects.cognitive"
  | "subjective_effects.physical"
  | "interactions.dangerous"
  | "interactions.unsafe"
  | "interactions.caution"
  | "tolerance.cross_tolerance"
  | "legality.international"
  | "harm_potential.risks.other"
);

export type ControlledTagMultiSelectProps = Omit<TagMultiSelectProps, "value" | "onChange"> & {
  name: ArrayFieldPath;
};

export function ControlledTagMultiSelect({
  name,
  ...props
}: ControlledTagMultiSelectProps) {
  const { control } = useFormContext<SubstanceArticle>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TagMultiSelect
          {...props}
          value={field.value ?? []}
          onChange={field.onChange}
        />
      )}
    />
  );
}
