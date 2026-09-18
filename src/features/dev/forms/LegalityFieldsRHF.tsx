/**
 * RHF-based Legality fields component.
 * Handles international treaties and country-specific legal status.
 * Layout mirrors the public article display with International and By Country subsections.
 */

import { Icon } from "@/components/common/Icon";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";
import { ControlledTagMultiSelect, TextListInput, CountryLegalityCardEditor } from "./rhf";

export type LegalityFieldsRHFProps = {
  idPrefix: string;
  embedded?: boolean;
};

export function LegalityFieldsRHF({ idPrefix: _idPrefix, embedded = false }: LegalityFieldsRHFProps) {
  return (
    <section className="space-y-4">
      {/* International Status */}
      <CollapsibleEditorCard
        title="International"
        icon={<Icon icon="lucide:globe" size={20} />}
        density="compact"
        pairedIndicator={embedded}
        keepMounted={embedded}
      >
        {embedded ? <TextListInput
          embedded
          name="legality.international"
          label="International status statements"
          helperText="Keep each convention statement and its primary-source [cite:reference-id] markers together. Enter adds a statement; Shift+Enter starts a new line."
          placeholder="Convention, scheduling status, and supporting source marker"
          addButtonLabel="Add international status"
        /> : <ControlledTagMultiSelect
          name="legality.international"
          label="International Status"
          placeholder="Add international status"
          options={[]}
          addButtonLabel="Add status"
          openStrategy="focus"
        />}
      </CollapsibleEditorCard>

      {/* Country-Specific Status */}
      <CollapsibleEditorCard
        title="By Country"
        icon={<Icon icon="lucide:map-pin" size={20} />}
        density="compact"
        pairedIndicator={embedded}
        keepMounted={embedded}
      >
        <CountryLegalityCardEditor />
      </CollapsibleEditorCard>
    </section>
  );
}
