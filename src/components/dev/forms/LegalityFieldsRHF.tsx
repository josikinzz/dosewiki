/**
 * RHF-based Legality fields component.
 * Handles international treaties and country-specific legal status.
 */

import { Scale } from "lucide-react";

import { SectionHeader, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect, CountryLegalityInput } from "./rhf";

export type LegalityFieldsRHFProps = {
  idPrefix: string;
};

export function LegalityFieldsRHF({ idPrefix }: LegalityFieldsRHFProps) {
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Legality"
        description="International scheduling and country-specific legal status."
        icon={<Scale className="h-5 w-5" />}
      />
      <div className="space-y-2">
        <ControlledTagMultiSelect
          name="legality.international"
          label="International Status"
          helperText="UN conventions, EU frameworks, or other international treaties."
          placeholder="Add international status"
          options={[]}
          addButtonLabel="Add status"
          openStrategy="focus"
        />
      </div>
      <div className="space-y-2">
        <label className="mb-1 block text-sm font-medium text-white/80">
          Country-Specific Status
        </label>
        <CountryLegalityInput
          placeholder="Country | Status | Notes (one per line)&#10;e.g., United States | Schedule I | Controlled Substances Act&#10;United Kingdom | Class A | Misuse of Drugs Act 1971"
          rows={8}
        />
        <p className={helperTextClass}>
          Enter one country per line in the format: Country | Status | Notes (notes optional).
        </p>
      </div>
    </section>
  );
}
