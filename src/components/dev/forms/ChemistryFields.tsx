import { TagMultiSelect } from "../../common/TagMultiSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SectionHeader, CharacterCount, helperTextClass } from "./FormHelpers";
import type { ChemistryFieldsProps } from "./types";

export const ChemistryFields = ({
  idPrefix,
  form,
  handleFieldChange,
  handleTagFieldChange,
  chemicalClassOptions,
  psychoactiveClassOptions,
  mechanismOptions,
}: ChemistryFieldsProps) => {
  const handleChemicalClassChange = handleTagFieldChange("chemicalClasses");
  const handlePsychoactiveClassChange = handleTagFieldChange("psychoactiveClasses");
  const handleMechanismChange = handleTagFieldChange("mechanismEntries");

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Chemistry & Pharmacology"
        description="Feeds the Chemistry & Pharmacology card chips and mechanism copy."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <TagMultiSelect
          label="Chemical class"
          helperText="Use the + button to browse chemical classes. Type when filtering or adding a new descriptor."
          placeholder="Filter or create chemical classes"
          value={form.chemicalClasses}
          onChange={handleChemicalClassChange}
          options={chemicalClassOptions}
          addButtonLabel="Add chemical class"
          openStrategy="button"
        />
        <TagMultiSelect
          label="Psychoactive class"
          helperText="Tap the + button to open the picker. Type to filter or capture a brand-new psychoactive class."
          placeholder="Filter or create psychoactive classes"
          value={form.psychoactiveClasses}
          onChange={handlePsychoactiveClassChange}
          options={psychoactiveClassOptions}
          addButtonLabel="Add psychoactive class"
          openStrategy="button"
        />
    </div>
    <div className="space-y-2">
      <TagMultiSelect
        label="Mechanism of action"
        helperText="Use the + button to pick existing targets. Type only when filtering or defining a new mechanism."
        placeholder="Filter or create mechanisms"
        value={form.mechanismEntries}
        onChange={handleMechanismChange}
        options={mechanismOptions}
        addButtonLabel="Add mechanism of action"
        openStrategy="button"
      />
        <CharacterCount value={form.mechanismOfAction} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-half-life`}>
          Half-life (optional)
        </Label>
        <Input
          id={`${idPrefix}-half-life`}
          value={form.halfLife}
          onChange={handleFieldChange("halfLife")}
          placeholder="e.g., ~3.6 hours"
        />
        <p className={helperTextClass}>Shown in the Chemistry & Pharmacology card under kinetics.</p>
      </div>
    </section>
  );
};
