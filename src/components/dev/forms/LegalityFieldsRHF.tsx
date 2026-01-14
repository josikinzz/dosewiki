/**
 * RHF-based Legality fields component.
 * Handles international treaties and country-specific legal status.
 * Layout mirrors the public article display with International and By Country subsections.
 */

import { Globe, MapPin } from "lucide-react";
import { CollapsibleSubsection } from "./FormHelpers";
import { ControlledTagMultiSelect, CountryLegalityCardEditor } from "./rhf";

export type LegalityFieldsRHFProps = {
  idPrefix: string;
};

export function LegalityFieldsRHF({ idPrefix: _idPrefix }: LegalityFieldsRHFProps) {
  return (
    <section className="space-y-4">
      {/* International Status */}
      <CollapsibleSubsection
        title="International"
        icon={<Globe className="h-5 w-5" />}
      >
        <ControlledTagMultiSelect
          name="legality.international"
          label="International Status"
          placeholder="Add international status"
          options={[]}
          addButtonLabel="Add status"
          openStrategy="focus"
        />
      </CollapsibleSubsection>

      {/* Country-Specific Status */}
      <CollapsibleSubsection
        title="By Country"
        icon={<MapPin className="h-5 w-5" />}
      >
        <CountryLegalityCardEditor />
      </CollapsibleSubsection>
    </section>
  );
}
