/**
 * RHF-based Classification fields component.
 * Displays psychoactive and chemical class fields to match
 * their prominent position in the public HeroSection.
 */

import { BrainCog, Hexagon } from "lucide-react";

import { ControlledTagMultiSelect } from "./rhf";
import type { TagOption } from "../../../data/config/tagOptions";

export type ClassificationFieldsRHFProps = {
  chemicalClassOptions: TagOption[];
  psychoactiveClassOptions: TagOption[];
};

export function ClassificationFieldsRHF({
  chemicalClassOptions,
  psychoactiveClassOptions,
}: ClassificationFieldsRHFProps) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <ControlledTagMultiSelect
          name="classification.psychoactive_class"
          label="Psychoactive Class"
          placeholder="Add class"
          options={psychoactiveClassOptions}
          openStrategy="button"
          icon={<BrainCog className="h-3.5 w-3.5 text-fuchsia-300" />}
        />
        <ControlledTagMultiSelect
          name="classification.chemical_class"
          label="Chemical Class"
          placeholder="Add class"
          options={chemicalClassOptions}
          openStrategy="button"
          icon={<Hexagon className="h-3.5 w-3.5 text-fuchsia-300" />}
        />
      </div>
    </section>
  );
}
