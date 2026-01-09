/**
 * RHF-based Chemistry and Pharmacology fields component.
 */

import { useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SectionHeader, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
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
      />
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
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-half-life`}>
          Half-life (optional)
        </Label>
        <Input
          id={`${idPrefix}-half-life`}
          {...register("pharmacology.half_life")}
          placeholder="e.g., ~3.6 hours"
        />
        <p className={helperTextClass}>Shown in the Chemistry & Pharmacology card under kinetics.</p>
      </div>
    </section>
  );
}
