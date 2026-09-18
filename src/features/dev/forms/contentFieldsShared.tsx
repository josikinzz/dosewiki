import { Icon } from "@/components/common/Icon";
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
import { EditorField, EditorFieldRow } from "@/features/dev/components";
import { EntryCard } from "./EntryCard";
import { useEntryKeys } from "./useEntryKeys";
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
      value={value ?? "none"}
      onValueChange={(nextValue) => onChange(nextValue === "none" ? null : (nextValue as RiskLevel))}
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
  entryKey,
  index,
  onChange,
  onRemove,
}: {
  entry: LD50Entry;
  entryKey: string;
  index: number;
  onChange: (updated: LD50Entry) => void;
  onRemove: () => void;
}) {
  const title = [entry.species, entry.route].filter(Boolean).join(" · ") || `LD50 entry ${index + 1}`;
  return (
    <EntryCard
      title={title}
      onRemove={onRemove}
      removeLabel={`Remove ${title}`}
    >
      <EditorFieldRow layout="twoColumn" className="sm:grid-cols-4">
        <EditorField htmlFor={`${entryKey}-species`} label="Species">
          <Select
            value={entry.species}
            onValueChange={(nextValue) => onChange({ ...entry, species: nextValue })}
          >
            <SelectTrigger id={`${entryKey}-species`} selectSize="sm">
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
        </EditorField>
        <EditorField htmlFor={`${entryKey}-route`} label="Route">
          <Select
            value={entry.route}
            onValueChange={(nextValue) => onChange({ ...entry, route: nextValue })}
          >
            <SelectTrigger id={`${entryKey}-route`} selectSize="sm">
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
        </EditorField>
        <EditorField htmlFor={`${entryKey}-value`} label="Value">
          <Input
            id={`${entryKey}-value`}
            type="number"
            step="any"
            inputSize="sm"
            value={entry.value ?? ""}
            onChange={(event) => onChange({
              ...entry,
              value: event.target.value ? Number(event.target.value) : null,
            })}
            placeholder="e.g., 400"
          />
        </EditorField>
        <EditorField htmlFor={`${entryKey}-unit`} label="Unit">
          <Input
            id={`${entryKey}-unit`}
            inputSize="sm"
            value={entry.unit}
            onChange={(event) => onChange({ ...entry, unit: event.target.value })}
            placeholder="mg/kg"
          />
        </EditorField>
      </EditorFieldRow>
    </EntryCard>
  );
}

export function LD50ArrayEditor({
  entries,
  onChange,
}: {
  entries: LD50Entry[];
  onChange: (entries: LD50Entry[]) => void;
}) {
  const { keys, appendKey, removeKey } = useEntryKeys(entries.length);

  const handleAdd = () => {
    appendKey();
    onChange([...entries, { species: "", route: "", value: null, unit: "mg/kg" }]);
  };

  const handleUpdate = (index: number, updated: LD50Entry) => {
    const nextEntries = [...entries];
    nextEntries[index] = updated;
    onChange(nextEntries);
  };

  const handleRemove = (index: number) => {
    const entry = entries[index];
    const populated = entry.species.trim() || entry.route.trim() || entry.value != null || (entry.unit.trim() && entry.unit !== "mg/kg");
    if (populated && typeof window !== "undefined" && !window.confirm(`Remove LD50 entry ${index + 1}? This cannot be undone.`)) return;
    removeKey(index);
    onChange(entries.filter((_, entryIndex) => entryIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="theme-text-muted text-sm font-medium leading-5">LD50 Data</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
        >
          <Icon icon="lucide:plus" size={14} className="mr-1" />
          Add LD50 entry
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="theme-text-faint text-xs italic py-2">No LD50 data. Add an LD50 entry to begin.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <LD50EntryEditor
              key={keys[index]}
              entry={entry}
              entryKey={keys[index]}
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
  entryKey,
  index,
  onChange,
  onRemove,
}: {
  entry: OrganToxicityEntry;
  entryKey: string;
  index: number;
  onChange: (updated: OrganToxicityEntry) => void;
  onRemove: () => void;
}) {
  return (
    <EntryCard
      icon={<Icon icon="lucide:activity" size={14} />}
      title={entry.system || `Entry ${index + 1}`}
      onRemove={onRemove}
      removeLabel={`Remove ${entry.system || `entry ${index + 1}`}`}
      bodyClassName="space-y-3"
    >
      <EditorField htmlFor={`${entryKey}-system`} label="Organ System">
        <Select
          value={entry.system}
          onValueChange={(nextValue) => onChange({ ...entry, system: nextValue })}
        >
          <SelectTrigger id={`${entryKey}-system`} selectSize="sm">
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
      </EditorField>

      <EditorField htmlFor={`${entryKey}-findings`} label="Findings">
        <Textarea
          id={`${entryKey}-findings`}
          className="min-h-[60px]"
          value={entry.findings}
          onChange={(event) => onChange({ ...entry, findings: event.target.value })}
          placeholder="Observable symptoms, clinical findings, diagnoses..."
        />
      </EditorField>

      <EditorField htmlFor={`${entryKey}-mechanism`} label="Mechanism">
        <Textarea
          id={`${entryKey}-mechanism`}
          className="min-h-[50px]"
          value={entry.mechanism}
          onChange={(event) => onChange({ ...entry, mechanism: event.target.value })}
          placeholder="Biochemical pathways, cellular processes (leave empty if unknown)..."
        />
      </EditorField>

      <EditorField htmlFor={`${entryKey}-notes`} label="Notes">
        <Textarea
          id={`${entryKey}-notes`}
          className="min-h-[50px]"
          value={entry.notes}
          onChange={(event) => onChange({ ...entry, notes: event.target.value })}
          placeholder="Prevalence, reversibility, risk factors, case counts..."
        />
      </EditorField>
    </EntryCard>
  );
}

export function OrganToxicityArrayEditor({
  entries,
  onChange,
}: {
  entries: OrganToxicityEntry[];
  onChange: (entries: OrganToxicityEntry[]) => void;
}) {
  const { keys, appendKey, removeKey } = useEntryKeys(entries.length);

  const handleAdd = () => {
    appendKey();
    onChange([...entries, { system: "", findings: "", mechanism: "", notes: "" }]);
  };

  const handleUpdate = (index: number, updated: OrganToxicityEntry) => {
    const nextEntries = [...entries];
    nextEntries[index] = updated;
    onChange(nextEntries);
  };

  const handleRemove = (index: number) => {
    const entry = entries[index];
    const populated = entry.system.trim() || entry.findings.trim() || entry.mechanism.trim() || entry.notes.trim();
    if (populated && typeof window !== "undefined" && !window.confirm(`Remove ${entry.system.trim() || `organ toxicity entry ${index + 1}`}? This cannot be undone.`)) return;
    removeKey(index);
    onChange(entries.filter((_, entryIndex) => entryIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="theme-text-muted text-sm font-medium leading-5">Organ Toxicity</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
        >
          <Icon icon="lucide:plus" size={14} className="mr-1" />
          Add organ entry
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="theme-text-faint text-xs italic py-2">No organ toxicity data. Add an organ entry to begin.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <OrganToxicityEntryEditor
              key={keys[index]}
              entry={entry}
              entryKey={keys[index]}
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
