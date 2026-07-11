/**
 * Card-based editor for country legality records.
 * Displays each country as an editable card with status, notes, and flag.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { EditorField } from "@/features/dev/components";
import { EntryCard } from "@/features/dev/forms/EntryCard";
import { getCountryCode, getAllCountryNames } from "@/utils/data/countryCodes";
import type { SubstanceArticle, CountryLegality } from "@/schema";

// Transform countries object to array for field array
type CountryEntry = {
  country: string;
  status: string;
  notes: string;
  canonicalStatus?: CountryLegality["canonicalStatus"];
  instrument?: string;
};

function objectToArray(countries: Record<string, CountryLegality>): CountryEntry[] {
  return Object.entries(countries || {}).map(([country, info]) => ({
    country,
    status: info.status || "",
    notes: info.notes || "",
    canonicalStatus: info.canonicalStatus,
    instrument: info.instrument,
  }));
}

function arrayToObject(entries: CountryEntry[]): Record<string, CountryLegality> {
  const result: Record<string, CountryLegality> = {};
  for (const entry of entries) {
    if (entry.country.trim()) {
      result[entry.country.trim()] = {
        status: entry.status || "",
        notes: entry.notes || "",
        ...(entry.canonicalStatus ? { canonicalStatus: entry.canonicalStatus } : {}),
        ...(entry.instrument ? { instrument: entry.instrument } : {}),
      };
    }
  }
  return result;
}

interface CountryCardProps {
  index: number;
  country: string;
  status: string;
  notes: string;
  onRemove: () => void;
  onUpdate: (field: keyof CountryEntry, value: string) => void;
}

function CountryCard({ index, country, status, notes, onRemove, onUpdate }: CountryCardProps) {
  const countryCode = getCountryCode(country);
  const countryId = `country-legality-${index}-country`;
  const statusId = `country-legality-${index}-status`;
  const notesId = `country-legality-${index}-notes`;

  return (
    <EntryCard
      title={
        <span className="flex items-center gap-2">
          {countryCode ? (
            <AppImage
              src={`/flags/${countryCode}.svg`}
              alt={`${country} flag`}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full ring-1 ring-[var(--theme-border-subtle)] shadow-[0_2px_8px_-2px_var(--theme-shadow-soft)]"
            />
          ) : null}
          {country || "New country"}
        </span>
      }
      onRemove={onRemove}
      removeLabel={`Remove ${country || "country"}`}
    >
      {/* Country name */}
      <EditorField htmlFor={countryId} label="Country">
        <Input
          id={countryId}
          value={country}
          onChange={(e) => onUpdate("country", e.target.value)}
          placeholder="e.g., United States"
          inputSize="sm"
          list={`country-list-${index}`}
        />
        <datalist id={`country-list-${index}`}>
          {getAllCountryNames().map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </EditorField>

      {/* Status */}
      <EditorField htmlFor={statusId} label="Status">
        <Input
          id={statusId}
          value={status}
          onChange={(e) => onUpdate("status", e.target.value)}
          placeholder="e.g., Schedule I, Class A, Illegal"
          inputSize="sm"
        />
      </EditorField>

      {/* Notes */}
      <EditorField
        htmlFor={notesId}
        label={
          <span>
            Notes <span className="theme-text-faint">(optional)</span>
          </span>
        }
      >
        <Textarea
          id={notesId}
          value={notes}
          onChange={(e) => onUpdate("notes", e.target.value)}
          placeholder="Additional details, exceptions, or context..."
          rows={2}
          className="text-sm resize-none"
        />
      </EditorField>
    </EntryCard>
  );
}

export interface CountryLegalityCardEditorProps {
  className?: string;
}

export function CountryLegalityCardEditor({ className }: CountryLegalityCardEditorProps) {
  const { watch, setValue } = useFormContext<SubstanceArticle>();

  // Watch the countries object
  const countriesObj = watch("legality.countries") || {};

  // Convert to array for editing
  const entries = objectToArray(countriesObj);

  const updateEntries = useCallback(
    (newEntries: CountryEntry[]) => {
      setValue("legality.countries", arrayToObject(newEntries), { shouldDirty: true });
    },
    [setValue]
  );

  const handleAdd = useCallback(() => {
    updateEntries([...entries, { country: "", status: "", notes: "" }]);
  }, [entries, updateEntries]);

  const handleRemove = useCallback(
    (index: number) => {
      const newEntries = entries.filter((_, i) => i !== index);
      updateEntries(newEntries);
    },
    [entries, updateEntries]
  );

  const handleUpdate = useCallback(
    (index: number, field: keyof CountryEntry, value: string) => {
      const newEntries = [...entries];
      newEntries[index] = { ...newEntries[index], [field]: value };
      updateEntries(newEntries);
    },
    [entries, updateEntries]
  );

  return (
    <div className={className}>
      {/* Country cards grid */}
      {entries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {entries.map((entry, index) => (
            <CountryCard
              key={index}
              index={index}
              country={entry.country}
              status={entry.status}
              notes={entry.notes}
              onRemove={() => handleRemove(index)}
              onUpdate={(field, value) => handleUpdate(index, field, value)}
            />
          ))}
        </div>
      )}

      {/* Add button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="w-full border-dashed"
      >
        <Icon icon="lucide:plus" className="h-4 w-4 mr-2" size={16} />
        Add Country
      </Button>

      {entries.length === 0 && (
        <EmptyStateSurface padding="sm" radius="lg" className="mt-3 text-xs">
          No countries added yet. Click &ldquo;Add Country&rdquo; to begin.
        </EmptyStateSurface>
      )}
    </div>
  );
}
