/**
 * Card-based editor for country legality records.
 * Displays each country as an editable card with status, notes, and flag.
 */

import { useCallback } from "react";
import { Controller, useFormContext, useFieldArray } from "react-hook-form";
import { Plus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getCountryCode, getAllCountryNames } from "../../../../utils/data/countryCodes";
import type { SubstanceArticle, CountryLegality } from "../../../../schema";

// Transform countries object to array for field array
type CountryEntry = {
  country: string;
  status: string;
  notes: string;
};

function objectToArray(countries: Record<string, CountryLegality>): CountryEntry[] {
  return Object.entries(countries || {}).map(([country, info]) => ({
    country,
    status: info.status || "",
    notes: info.notes || "",
  }));
}

function arrayToObject(entries: CountryEntry[]): Record<string, CountryLegality> {
  const result: Record<string, CountryLegality> = {};
  for (const entry of entries) {
    if (entry.country.trim()) {
      result[entry.country.trim()] = {
        status: entry.status || "",
        notes: entry.notes || "",
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

  return (
    <div className="relative rounded-xl border border-white/10 bg-white/[0.02] p-4">
      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 p-1 text-white/30 hover:text-red-400 transition-colors"
        aria-label={`Remove ${country || "country"}`}
      >
        <X className="h-4 w-4" />
      </button>

      {/* Flag */}
      {countryCode && (
        <img
          src={`/flags/${countryCode}.svg`}
          alt={`${country} flag`}
          className="absolute right-10 top-3 h-6 w-6 rounded-full ring-1 ring-white/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)]"
        />
      )}

      <div className="space-y-3 pr-16">
        {/* Country name */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">
            Country
          </label>
          <Input
            value={country}
            onChange={(e) => onUpdate("country", e.target.value)}
            placeholder="e.g., United States"
            className="h-8 text-sm"
            list={`country-list-${index}`}
          />
          <datalist id={`country-list-${index}`}>
            {getAllCountryNames().map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">
            Status
          </label>
          <Input
            value={status}
            onChange={(e) => onUpdate("status", e.target.value)}
            placeholder="e.g., Schedule I, Class A, Illegal"
            className="h-8 text-sm"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1">
            Notes <span className="text-white/30">(optional)</span>
          </label>
          <Textarea
            value={notes}
            onChange={(e) => onUpdate("notes", e.target.value)}
            placeholder="Additional details, exceptions, or context..."
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      </div>
    </div>
  );
}

export interface CountryLegalityCardEditorProps {
  className?: string;
}

export function CountryLegalityCardEditor({ className }: CountryLegalityCardEditorProps) {
  const { control, watch, setValue } = useFormContext<SubstanceArticle>();

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
        className="w-full border-dashed border-white/20 text-white/60 hover:text-white hover:border-white/40"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Country
      </Button>

      {entries.length === 0 && (
        <p className="text-center text-xs text-white/40 mt-3">
          No countries added yet. Click "Add Country" to begin.
        </p>
      )}
    </div>
  );
}
