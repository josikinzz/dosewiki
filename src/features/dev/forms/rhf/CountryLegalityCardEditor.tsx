import { useId, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorFieldRow, EditorSelect } from "@/features/dev/components";
import { EntryCard } from "../EntryCard";
import { CANONICAL_LEGAL_STATUSES, CANONICAL_STATUS_LABELS } from "@/schema/substance/legalStatuses";
import type { CountryLegality, SubstanceArticle } from "@/schema";

export interface CountryLegalityCardEditorProps { className?: string }

export function CountryLegalityCardEditor({ className }: CountryLegalityCardEditorProps) {
  const { watch, setValue } = useFormContext<SubstanceArticle>();
  const countries = watch("legality.countries") ?? {};
  const id = useId();
  const [newCountry, setNewCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = (country: string, patch: Partial<CountryLegality>) => {
    setValue("legality.countries", { ...countries, [country]: { ...countries[country], ...patch } }, { shouldDirty: true });
  };
  const addCountry = () => {
    const name = newCountry.trim();
    if (!name) { setError("Enter a country name."); return; }
    if (["__proto__", "constructor", "prototype"].includes(name)) { setError("Enter a valid country name."); return; }
    const existing = Object.keys(countries).find((key) => key.toLowerCase() === name.toLowerCase());
    if (existing) { setError(`${existing} already has an entry. Edit that country above.`); return; }
    setValue("legality.countries", { ...countries, [name]: { status: "", notes: "" } }, { shouldDirty: true });
    setNewCountry("");
    setError(null);
  };
  return (
    <div className={className}>
      <p className="theme-text-muted mb-4 max-w-prose text-sm">Country identity is fixed. Review status, legal instrument, public notes, and cited sources together. Keep research and internal review notes out of public prose.</p>
      <div className="space-y-4">
        {Object.entries(countries).map(([country, entry], index) => (
          <EntryCard key={country} title={country} bodyClassName="space-y-4" removeLabel={`Remove ${country}`} onRemove={() => {
            if (!window.confirm(`Remove ${country} and its legal status, instrument, and public notes from this draft?`)) return;
            const next = { ...countries };
            delete next[country];
            setValue("legality.countries", next, { shouldDirty: true });
          }}>
            <EditorFieldRow layout="twoColumn">
              <EditorField label="Canonical legal status" htmlFor={`${id}-canonical-${index}`} description="Sets the public status badge when selected.">
                {(props) => <EditorSelect {...props} value={entry.canonicalStatus ?? ""} onChange={(event) => update(country, { canonicalStatus: event.target.value as CountryLegality["canonicalStatus"] })}>
                  <option value="">Select status</option>
                  {CANONICAL_LEGAL_STATUSES.map((status) => <option key={status} value={status}>{CANONICAL_STATUS_LABELS[status]}</option>)}
                </EditorSelect>}
              </EditorField>
              <EditorField label="Status text" htmlFor={`${id}-status-${index}`} description="Used for the badge only when no canonical status is selected.">
                {(props) => <Input {...props} value={entry.status ?? ""} onChange={(event) => update(country, { status: event.target.value })} />}
              </EditorField>
            </EditorFieldRow>
            <EditorFieldRow layout="twoColumn">
              <EditorField label="Legal instrument" htmlFor={`${id}-instrument-${index}`}>
                <Input id={`${id}-instrument-${index}`} value={entry.instrument ?? ""} onChange={(event) => update(country, { instrument: event.target.value })} placeholder="Name of the statute, regulation, or convention" />
              </EditorField>
              <EditorField label="Schedule or designation" htmlFor={`${id}-designation-${index}`}>
                <Input id={`${id}-designation-${index}`} value={entry.designation ?? ""} onChange={(event) => update(country, { designation: event.target.value })} placeholder="Schedule, list, or statutory designation" />
              </EditorField>
            </EditorFieldRow>
            <EditorField label="Public notes and source markers" htmlFor={`${id}-notes-${index}`}>
              <Textarea id={`${id}-notes-${index}`} value={entry.notes ?? ""} onChange={(event) => update(country, { notes: event.target.value })} placeholder="Encyclopedic notes with [cite:reference-id] primary legal sources" />
            </EditorField>
          </EntryCard>
        ))}
      </div>
      <EditorFieldRow layout="actionTrailing" className="mt-4">
        <EditorField label="New country" htmlFor={`${id}-new-country`} error={error} errorLive>
          {(props) => <Input {...props} value={newCountry} onChange={(event) => { setNewCountry(event.target.value); setError(null); }} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              addCountry();
            }
          }} />}
        </EditorField>
        <Button type="button" variant="outline" onClick={addCountry}>Add country</Button>
      </EditorFieldRow>
    </div>
  );
}
