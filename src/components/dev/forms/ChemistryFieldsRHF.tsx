/**
 * RHF-based Chemistry and Pharmacology fields component.
 */

import { useFormContext } from "react-hook-form";
import { FlaskConical } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { SectionHeader, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect, RecordStringInput } from "./rhf";
import type { TagOption } from "../../../data/config/tagOptions";
import type { SubstanceArticle } from "../../../schema";

export type ChemistryFieldsRHFProps = {
  idPrefix: string;
  chemicalClassOptions: TagOption[];
  psychoactiveClassOptions: TagOption[];
  mechanismOptions: TagOption[];
};

export function ChemistryFieldsRHF({
  idPrefix,
  chemicalClassOptions,
  psychoactiveClassOptions,
  mechanismOptions,
}: ChemistryFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Chemistry & Pharmacology"
        description="Feeds the Chemistry & Pharmacology card chips and mechanism copy."
        icon={<FlaskConical className="h-5 w-5" />}
      />
      
      {/* Classification */}
      <div className="grid gap-4 md:grid-cols-2">
        <ControlledTagMultiSelect
          name="classification.chemical_class"
          label="Chemical class"
          helperText="Use the + button to browse chemical classes. Type when filtering or adding a new descriptor."
          placeholder="Filter or create chemical classes"
          options={chemicalClassOptions}
          addButtonLabel="Add chemical class"
          openStrategy="button"
        />
        <ControlledTagMultiSelect
          name="classification.psychoactive_class"
          label="Psychoactive class"
          helperText="Tap the + button to open the picker. Type to filter or capture a brand-new psychoactive class."
          placeholder="Filter or create psychoactive classes"
          options={psychoactiveClassOptions}
          addButtonLabel="Add psychoactive class"
          openStrategy="button"
        />
      </div>
      
      {/* Mechanism of Action */}
      <div className="space-y-2">
        <ControlledTagMultiSelect
          name="pharmacology.mechanism_of_action"
          label="Mechanism of action"
          helperText="Use the + button to pick existing targets. Type only when filtering or defining a new mechanism."
          placeholder="Filter or create mechanisms"
          options={mechanismOptions}
          addButtonLabel="Add mechanism of action"
          openStrategy="button"
        />
      </div>
      
      {/* Receptor Binding */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-receptor-binding`}>
          Receptor Binding Profile
        </Label>
        <RecordStringInput
          name="pharmacology.receptor_binding"
          className="min-h-[80px]"
          placeholder="receptor: affinity (one per line, e.g., 5-HT2A: Ki = 0.3 nM)"
        />
        <p className={helperTextClass}>
          Quantitative or qualitative receptor binding information.
        </p>
      </div>
      
      {/* Pharmacokinetics */}
      <p className="text-xs font-medium uppercase tracking-wider text-white/50">Pharmacokinetics</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-half-life`}>
            Half-life
          </Label>
          <Input
            id={`${idPrefix}-half-life`}
            {...register("pharmacology.half_life")}
            placeholder="e.g., ~3.6 hours"
          />
        </div>
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
      
      {/* Metabolism */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-metabolism`}>
            Metabolism
          </Label>
          <Textarea
            id={`${idPrefix}-metabolism`}
            className="min-h-[80px]"
            {...register("pharmacology.metabolism")}
            placeholder="Describe metabolic pathway (e.g., CYP2D6, CYP3A4 hepatic metabolism)"
          />
        </div>
        <div className="space-y-2">
          <ControlledTagMultiSelect
            name="pharmacology.metabolites"
            label="Active Metabolites"
            helperText="Key metabolites with pharmacological activity."
            placeholder="Add metabolite"
            options={[]}
            addButtonLabel="Add metabolite"
            openStrategy="focus"
          />
        </div>
      </div>
      
      {/* Additional Notes */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-bioavailability-notes`}>
          Bioavailability Notes
        </Label>
        <Textarea
          id={`${idPrefix}-bioavailability-notes`}
          className="min-h-[60px]"
          {...register("pharmacology.bioavailability_notes")}
          placeholder="Additional notes on absorption, food effects, or route-specific considerations."
        />
      </div>
    </section>
  );
}
