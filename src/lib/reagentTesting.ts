import { getReagentColorHex } from "@/constants/reagentColors";
import type {
  NormalizedReagentData,
  NormalizedReagentResult,
  ProtestKitResponse,
  ReagentColor,
  ReagentDisplayEntry,
  ReagentResult,
} from "@/types/reagent";

export type {
  NormalizedReagentData,
  ReagentDisplayEntry,
} from "@/types/reagent";

const PROTESTKIT_REAGENT_NAMES: Record<string, string> = {
  marq_desc: "marquis",
  meck_desc: "mecke",
  mand_desc: "mandelin",
  simo_desc: "simon",
  roba_desc: "robadope",
  froh_desc: "froehde",
  lieb_desc: "liebermann",
  ehrl_desc: "ehrlich",
  hofm_desc: "hofmann",
  foli_desc: "folin",
  gall_desc: "gallic",
  scot_desc: "scott",
};

const REAGENT_ORDER = [
  "marquis",
  "mecke",
  "mandelin",
  "simon",
  "robadope",
  "froehde",
  "liebermann",
  "ehrlich",
  "hofmann",
  "folin",
  "gallic",
  "scott",
];

/** The reagent names as the testing table heads them, in display order, for the glossary drafter. */
export const REAGENT_LABELS: readonly string[] = REAGENT_ORDER.map(capitalizeReagent);

export interface ReagentLookupInput {
  title?: string | null;
  commonName?: string | null;
  aliases?: readonly string[] | null;
}

export type ProtestKitValidationResult =
  | { ok: true; data: ProtestKitResponse }
  | { ok: false; error: string };

type ReagentResultValidationResult = { ok: true } | { ok: false; error: string };

export function normalizeReagentLookupName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "").trim();
}

export function buildReagentLookupCandidates(input: ReagentLookupInput): string[] {
  const rawCandidates = [
    input.commonName,
    input.title,
    ...(input.aliases ?? []),
  ];

  return [...new Set(rawCandidates.filter(Boolean).map((name) => normalizeReagentLookupName(String(name))).filter(Boolean))];
}





export function validateProtestKitResponse(value: unknown): ProtestKitValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: "ProtestKit response must be an object." };
  }

  if (!isRecord(value.substance)) {
    return { ok: false, error: "ProtestKit response is missing substance." };
  }

  if (typeof value.substance.name !== "string") {
    return { ok: false, error: "ProtestKit substance name must be a string." };
  }

  if (!Array.isArray(value.substance.aliases) || !value.substance.aliases.every((alias) => typeof alias === "string")) {
    return { ok: false, error: "ProtestKit substance aliases must be strings." };
  }

  if (!Array.isArray(value.reagents)) {
    return { ok: false, error: "ProtestKit reagents must be an array." };
  }

  for (const reagent of value.reagents) {
    const result = validateReagentResult(reagent);
    if (result.ok === false) {
      return { ok: false, error: result.error };
    }
  }

  return { ok: true, data: value as unknown as ProtestKitResponse };
}

export function normalizeProtestKitResponse(response: ProtestKitResponse): NormalizedReagentData {
  return {
    substance: {
      name: response.substance.name,
      aliases: response.substance.aliases,
    },
    reagents: sortReagentResults(response.reagents.map(normalizeReagentResult)),
  };
}

export function reagentDataToStaticRecords(data: NormalizedReagentData): Record<string, string> {
  return Object.fromEntries(data.reagents.map((entry) => [entry.reagent, entry.description]));
}

export function reagentDataToDisplayEntries(data: NormalizedReagentData | null | undefined): ReagentDisplayEntry[] {
  if (!data) {
    return [];
  }

  return data.reagents.map((entry) => ({
    key: entry.key,
    reagent: entry.reagent,
    label: entry.label,
    description: entry.description,
    hint: entry.hint,
    isReacting: entry.isReacting,
    colors: entry.colors,
  }));
}

export function staticReagentRecordsToDisplayEntries(records: readonly [string, string][]): ReagentDisplayEntry[] {
  return sortReagentResults(
    records
      .filter(([, description]) => description.trim().length > 0)
      .map(([reagent, description]) => ({
        key: reagent,
        reagent,
        label: capitalizeReagent(reagent),
        description,
        hint: "",
        isReacting: !isNoReactionDescription(description),
        isKnownReagent: REAGENT_ORDER.includes(reagent.toLowerCase()),
        colors: [],
      })),
  );
}

export function hasDisplayableReagentData(data: NormalizedReagentData | null | undefined): boolean {
  return reagentDataToDisplayEntries(data).length > 0;
}

function validateReagentResult(value: unknown): ReagentResultValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: "ProtestKit reagent result must be an object." };
  }

  if (typeof value.reagent !== "string") {
    return { ok: false, error: "ProtestKit reagent key must be a string." };
  }

  if (typeof value.hint !== "string") {
    return { ok: false, error: "ProtestKit reagent hint must be a string." };
  }

  if (typeof value.isReacting !== "boolean") {
    return { ok: false, error: "ProtestKit reagent reaction state must be a boolean." };
  }

  if (!Array.isArray(value.colors)) {
    return { ok: false, error: "ProtestKit reagent colors must be an array." };
  }

  for (const color of value.colors) {
    if (!isValidReagentColor(color)) {
      return { ok: false, error: "ProtestKit reagent color is malformed." };
    }
  }

  return { ok: true };
}

function isValidReagentColor(value: unknown): value is ReagentColor {
  return (
    isRecord(value) &&
    Number.isFinite(value.id) &&
    typeof value.name === "string" &&
    typeof value.simple === "boolean" &&
    Number.isFinite(value.simpleColorId)
  );
}

function normalizeReagentResult(result: ReagentResult): NormalizedReagentResult {
  const reagent = PROTESTKIT_REAGENT_NAMES[result.reagent] ?? result.reagent.replace(/_desc$/, "");
  const colors = result.colors.map((color) => ({
    id: color.id,
    name: color.name,
    hex: getReagentColorHex(color.simpleColorId),
  }));
  const colorNames = colors.map((color) => color.name).join(" → ");
  const description = result.isReacting ? colorNames || result.hint || "Reaction" : "No reaction";

  return {
    key: result.reagent,
    reagent,
    label: capitalizeReagent(reagent),
    description,
    colors,
    hint: result.hint,
    isReacting: result.isReacting,
    isKnownReagent: result.reagent in PROTESTKIT_REAGENT_NAMES,
  };
}

function sortReagentResults<T extends { reagent: string; description: string; isReacting?: boolean }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const aNoReaction = a.isReacting === false || isNoReactionDescription(a.description);
    const bNoReaction = b.isReacting === false || isNoReactionDescription(b.description);

    if (!aNoReaction && bNoReaction) return -1;
    if (aNoReaction && !bNoReaction) return 1;

    const aIndex = REAGENT_ORDER.indexOf(a.reagent.toLowerCase());
    const bIndex = REAGENT_ORDER.indexOf(b.reagent.toLowerCase());
    if (aIndex === -1 && bIndex === -1) return a.reagent.localeCompare(b.reagent);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

function isNoReactionDescription(description: string): boolean {
  const normalized = description.toLowerCase();
  return normalized.includes("no reaction") || normalized.includes("no change");
}

function capitalizeReagent(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
