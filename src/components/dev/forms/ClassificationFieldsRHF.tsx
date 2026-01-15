/**
 * RHF-based Classification fields component.
 * Displays psychoactive and chemical class fields to match
 * their prominent position in the public HeroSection.
 */

import { Icon } from "../../common/Icon";

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
          icon={<Icon icon="lucide:brain-cog" size={14} className="text-fuchsia-300" />}
        />
        <ControlledTagMultiSelect
          name="classification.chemical_class"
          label="Chemical Class"
          placeholder="Add class"
          options={chemicalClassOptions}
          openStrategy="button"
          icon={<Icon icon="solar:benzene-ring-line-duotone" size={14} className="text-fuchsia-300" />}
        />
      </div>
    </section>
  );
}
