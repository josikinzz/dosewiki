import { Icon } from "@/components/common/Icon";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CarcinogenicityLevel,
  LD50Entry,
  OrganToxicityEntry,
  RiskLevel,
} from "@/schema";

export const toleranceLabels: Array<{
  key: "full_tolerance" | "half_tolerance" | "baseline_tolerance";
  label: string;
  icon: string;
}> = [
  { key: "full_tolerance", label: "Full Tolerance", icon: "lucide:arrow-up-wide-narrow" },
  { key: "half_tolerance", label: "Half Tolerance", icon: "lucide:circle-slash-2" },
  { key: "baseline_tolerance", label: "Baseline Reset", icon: "lucide:arrow-down-wide-narrow" },
];

const RISK_LEVEL_OPTIONS: Array<{ value: RiskLevel | ""; label: string }> = [
  { value: "", label: "Not assessed" },
  { value: "extremely_low", label: "Extremely Low" },
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "extremely_high", label: "Extremely High" },
];

export const CARCINOGENICITY_LEVEL_OPTIONS: Array<{ value: CarcinogenicityLevel | ""; label: string }> = [
  { value: "", label: "Not assessed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "probable", label: "Probable" },
  { value: "possible", label: "Possible" },
  { value: "no_evidence", label: "No Evidence" },
  { value: "unknown", label: "Unknown" },
];

const LD50_ROUTE_OPTIONS = [
  "Oral",
  "IV",
  "Intravenous",
  "Subcutaneous",
  "Intraperitoneal",
  "Intramuscular",
  "Inhalation",
  "Dermal",
  "Unspecified",
];

const LD50_SPECIES_OPTIONS = [
  "Mouse",
  "Rat",
  "Rabbit",
  "Dog",
  "Guinea pig",
  "Human",
];

const ORGAN_SYSTEM_OPTIONS = [
  "Cardiovascular",
  "Central Nervous System",
  "Hepatic",
  "Renal",
  "Respiratory",
  "Urinary System",
  "Gastrointestinal",
  "Hematological",
  "Dermatological",
  "Endocrine",
  "Immune System",
  "Musculoskeletal",
];

export function RiskLevelSelect({
  id,
  onChange,
  value,
}: {
  id: string;
  onChange: (value: RiskLevel | null) => void;
  value: RiskLevel | null;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(nextValue) => onChange(nextValue === "" ? null : (nextValue as RiskLevel))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select level" />
      </SelectTrigger>
      <SelectContent>
        {RISK_LEVEL_OPTIONS.map((option) => (
          <SelectItem key={option.value || "none"} value={option.value || "none"}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LD50EntryEditor({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: LD50Entry;
  index: number;
  onChange: (updated: LD50Entry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-panel-base))] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/60">Entry {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-6 w-6 p-0 text-white/40 hover:text-red-400"
        >
          <Icon icon="lucide:x" size={14} />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Species</Label>
          <Select
            value={entry.species}
            onValueChange={(nextValue) => onChange({ ...entry, species: nextValue })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Species" />
            </SelectTrigger>
            <SelectContent>
              {LD50_SPECIES_OPTIONS.map((species) => (
                <SelectItem key={species} value={species}>
                  {species}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Route</Label>
          <Select
            value={entry.route}
            onValueChange={(nextValue) => onChange({ ...entry, route: nextValue })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Route" />
            </SelectTrigger>
            <SelectContent>
              {LD50_ROUTE_OPTIONS.map((route) => (
                <SelectItem key={route} value={route}>
                  {route}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Value</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            value={entry.value ?? ""}
            onChange={(event) => onChange({
              ...entry,
              value: event.target.value ? Number(event.target.value) : null,
            })}
            placeholder="e.g., 400"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <Input
            className="h-8 text-sm"
            value={entry.unit}
            onChange={(event) => onChange({ ...entry, unit: event.target.value })}
            placeholder="mg/kg"
          />
        </div>
      </div>
    </div>
  );
}

export function LD50ArrayEditor({
  entries,
  onChange,
}: {
  entries: LD50Entry[];
  onChange: (entries: LD50Entry[]) => void;
}) {
  const handleAdd = () => {
    onChange([...entries, { species: "", route: "", value: null, unit: "mg/kg" }]);
  };

  const handleUpdate = (index: number, updated: LD50Entry) => {
    const nextEntries = [...entries];
    nextEntries[index] = updated;
    onChange(nextEntries);
  };

  const handleRemove = (index: number) => {
    onChange(entries.filter((_, entryIndex) => entryIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">LD50 Data</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="h-7 text-xs"
        >
          <Icon icon="lucide:plus" size={14} className="mr-1" />
          Add Entry
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-white/40 italic py-2">No LD50 data. Click "Add Entry" to add.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <LD50EntryEditor
              key={index}
              entry={entry}
              index={index}
              onChange={(updated) => handleUpdate(index, updated)}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrganToxicityEntryEditor({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: OrganToxicityEntry;
  index: number;
  onChange: (updated: OrganToxicityEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-panel-base))] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:activity" size={14} className="text-rose-400/70" />
          <span className="text-sm font-medium text-white/80">{entry.system || `Entry ${index + 1}`}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-6 w-6 p-0 text-white/40 hover:text-red-400"
        >
          <Icon icon="lucide:x" size={14} />
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Organ System</Label>
        <Select
          value={entry.system}
          onValueChange={(nextValue) => onChange({ ...entry, system: nextValue })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select system" />
          </SelectTrigger>
          <SelectContent>
            {ORGAN_SYSTEM_OPTIONS.map((system) => (
              <SelectItem key={system} value={system}>
                {system}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Findings</Label>
        <Textarea
          className="min-h-[60px] text-sm"
          value={entry.findings}
          onChange={(event) => onChange({ ...entry, findings: event.target.value })}
          placeholder="Observable symptoms, clinical findings, diagnoses..."
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Mechanism</Label>
        <Textarea
          className="min-h-[50px] text-sm"
          value={entry.mechanism}
          onChange={(event) => onChange({ ...entry, mechanism: event.target.value })}
          placeholder="Biochemical pathways, cellular processes (leave empty if unknown)..."
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          className="min-h-[50px] text-sm"
          value={entry.notes}
          onChange={(event) => onChange({ ...entry, notes: event.target.value })}
          placeholder="Prevalence, reversibility, risk factors, case counts..."
        />
      </div>
    </div>
  );
}

export function OrganToxicityArrayEditor({
  entries,
  onChange,
}: {
  entries: OrganToxicityEntry[];
  onChange: (entries: OrganToxicityEntry[]) => void;
}) {
  const handleAdd = () => {
    onChange([...entries, { system: "", findings: "", mechanism: "", notes: "" }]);
  };

  const handleUpdate = (index: number, updated: OrganToxicityEntry) => {
    const nextEntries = [...entries];
    nextEntries[index] = updated;
    onChange(nextEntries);
  };

  const handleRemove = (index: number) => {
    onChange(entries.filter((_, entryIndex) => entryIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Organ Toxicity</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="h-7 text-xs"
        >
          <Icon icon="lucide:plus" size={14} className="mr-1" />
          Add Entry
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-white/40 italic py-2">No organ toxicity data. Click "Add Entry" to add.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <OrganToxicityEntryEditor
              key={index}
              entry={entry}
              index={index}
              onChange={(updated) => handleUpdate(index, updated)}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
