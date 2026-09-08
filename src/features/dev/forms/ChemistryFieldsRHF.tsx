/**
 * RHF-based Pharmacology fields component.
 * Classification fields have been moved to ClassificationFieldsRHF.
 */

import { useFieldArray, useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyStateSurface } from "@/components/ui/surface";
import { EditorFieldRow } from "@/features/dev/components";
import { FormEditorField } from "./FormEditorField";

import { EntryCard } from "./EntryCard";
import { CollapsibleSubsection } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
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
  const { register, control } = useFormContext<SubstanceArticle>();
  const bindingSites = useFieldArray({
    control,
    name: "pharmacology.binding_sites",
  });

  return (
    <section className="space-y-6">
      {/* Pharmacodynamics */}
      <FormEditorField
        htmlFor={`${idPrefix}-pharmacology-pharmacodynamics`}
        label="Pharmacodynamics"
        name="pharmacology.pharmacodynamics"
      >
        <Textarea
          id={`${idPrefix}-pharmacology-pharmacodynamics`}
          className="min-h-28 md:min-h-[80px]"
          {...register("pharmacology.pharmacodynamics")}
          placeholder="Plain-language pharmacodynamics overview"
        />
      </FormEditorField>

      {/* Binding sites combine target identity, mechanism, and measured activity. */}
      <div className="space-y-3">
        <p className="theme-text-faint flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
          <Icon icon="fluent:brain-circuit-28-filled" className="theme-icon-accent h-4 w-4" size={16} />
          Binding Sites
        </p>
        <div className="space-y-3">
          {bindingSites.fields.length === 0 && (
            <EmptyStateSurface padding="sm" radius="lg" className="text-sm">
              No binding-site entries yet.
            </EmptyStateSurface>
          )}
          {bindingSites.fields.map((field, index) => (
            <EntryCard
              key={field.id}
              title={`Binding Site ${index + 1}`}
              onRemove={() => bindingSites.remove(index)}
              removeLabel={`Remove binding-site entry ${index + 1}`}
            >
              <EditorFieldRow layout="twoColumn" className="xl:grid-cols-4">
                <FormEditorField
                  htmlFor={`${idPrefix}-target-${index}`}
                  label="Target"
                  name={`pharmacology.binding_sites.${index}.target`}
                >
                  <Input
                    id={`${idPrefix}-target-${index}`}
                    {...register(`pharmacology.binding_sites.${index}.target`)}
                    placeholder="e.g. 5-HT2A or SERT"
                  />
                </FormEditorField>
                <FormEditorField
                  htmlFor={`${idPrefix}-tag-${index}`}
                  label="Mechanism"
                  name={`pharmacology.binding_sites.${index}.tag`}
                  description="Action at the target, such as agonism or inhibition."
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...register(`pharmacology.binding_sites.${index}.tag`)}
                      placeholder="e.g. 5-HT2A receptor agonist"
                    />
                  )}
                </FormEditorField>
                <FormEditorField
                  htmlFor={`${idPrefix}-affinity-${index}`}
                  label="Affinity"
                  name={`pharmacology.binding_sites.${index}.affinity`}
                >
                  <Input
                    id={`${idPrefix}-affinity-${index}`}
                    {...register(`pharmacology.binding_sites.${index}.affinity`)}
                    placeholder="e.g. Ki = 2.9 nM"
                  />
                </FormEditorField>
                <FormEditorField
                  htmlFor={`${idPrefix}-efficacy-${index}`}
                  label="Efficacy / Notes"
                  name={`pharmacology.binding_sites.${index}.efficacy`}
                  description="Response details, qualifiers, or other notes."
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...register(`pharmacology.binding_sites.${index}.efficacy`)}
                      placeholder="e.g. partial agonist"
                    />
                  )}
                </FormEditorField>
              </EditorFieldRow>
            </EntryCard>
          ))}
          <Button
            type="button"
            variant="glass"
            size="pill"
            onClick={() => bindingSites.append({ target: "", tag: "", affinity: "", efficacy: "" })}
          >
            <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
            Add Binding Site
          </Button>
        </div>
      </div>

      {/* Pharmacokinetics & Metabolites */}
      <p className="theme-text-faint flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
        <Icon icon="material-symbols:metabolism-rounded" className="theme-icon-accent h-3.5 w-3.5" size={14} />
        Pharmacokinetics
      </p>
      <EditorFieldRow layout="twoColumn">
        <FormEditorField
          htmlFor={`${idPrefix}-pharmacokinetics`}
          label="Pharmacokinetics"
          name="pharmacology.pharmacokinetics"
        >
          <Textarea
            id={`${idPrefix}-pharmacokinetics`}
            className="min-h-28 md:min-h-[80px]"
            {...register("pharmacology.pharmacokinetics")}
            placeholder="Describe metabolic pathway (e.g., CYP2D6, CYP3A4 hepatic metabolism)"
          />
        </FormEditorField>
        <ControlledTagMultiSelect
          name="pharmacology.metabolites"
          label="Active Metabolites"
          placeholder="Add metabolite"
          helperText="Type a metabolite name and press Enter to add."
          emptyStateText="Type a metabolite name to add it."
          options={[]}
          addButtonLabel="Add metabolite"
          openStrategy="button"
        />
      </EditorFieldRow>
      
      {/* Extended pharmacokinetics - stored but not displayed in public section */}
      <CollapsibleSubsection
        title="Extended Pharmacokinetics"
        pairedIndicator
        icon={<Icon icon="lucide:timer" className="h-5 w-5" size={20} />}
        description="These fields are stored for data completeness but not currently displayed in the public article."
      >
        <EditorFieldRow layout="twoColumn">
          <FormEditorField
            htmlFor={`${idPrefix}-protein-binding`}
            label="Protein Binding"
            name="pharmacology.protein_binding"
          >
            <Input
              id={`${idPrefix}-protein-binding`}
              {...register("pharmacology.protein_binding")}
              placeholder="e.g., 80-85%"
            />
          </FormEditorField>
          <FormEditorField
            htmlFor={`${idPrefix}-volume-distribution`}
            label="Volume of Distribution"
            name="pharmacology.volume_of_distribution"
          >
            <Input
              id={`${idPrefix}-volume-distribution`}
              {...register("pharmacology.volume_of_distribution")}
              placeholder="e.g., 1.2 L/kg"
            />
          </FormEditorField>
        </EditorFieldRow>
      </CollapsibleSubsection>
    </section>
  );
}
