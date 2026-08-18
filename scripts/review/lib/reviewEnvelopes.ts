/**
 * Recognizes the recurring "envelope" shapes the review run wraps its values
 * in, and converts each into a storage value.
 *
 * The review model has no single value format. Across the 294 reviewed
 * proposals the same information arrives as `{ text, source_ids }`,
 * `{ content, source_ids }`, `{ value, source_ids }`, `{ paragraphs: [...] }`,
 * an array of any of those, an already-stored `{ min, max, unit }` triple, a
 * `{ stage, duration }` pair, a binding-site array, or a legality country
 * object. Each of those is mechanical. Anything else is a genuine editorial
 * composite and is refused here so it can be routed to a human decision rather
 * than guessed at.
 */
import { CITE_TOKEN_PATTERN } from "../../../src/lib/citations/citationTokens";
import {
  type Range,
  type ReviewParagraph,
  type StoredBindingSite,
  mapBindingSite,
  parseRangeText,
} from "./reviewDecisionTransforms";

export class UnknownEnvelopeError extends Error {
  readonly shape: string;

  constructor(shape: string) {
    super(`unrecognized review envelope: ${shape}`);
    this.name = "UnknownEnvelopeError";
    this.shape = shape;
  }
}

/** Describes a value's shape for diagnostics and routing. */
export function describeShape(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number" || typeof value === "boolean") return typeof value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "object" && first !== null) {
      return `array<${Object.keys(first).sort().join("+")}>`;
    }
    return `array<${typeof first}>`;
  }
  return `object{${Object.keys(value).sort().join("+")}}`;
}

const PROSE_KEYS = ["text", "content", "value", "note", "notes", "summary"] as const;

/** Reads the single prose field out of a paragraph-ish envelope. */
function proseFieldOf(entry: Record<string, unknown>): string | null {
  for (const key of PROSE_KEYS) {
    const candidate = entry[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

const sourceIdsOf = (entry: Record<string, unknown>): string[] => {
  const ids = entry.source_ids ?? entry.reference_ids ?? entry.sourceIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string");
};

/**
 * Normalizes any paragraph-ish envelope into the paragraph list `renderProse`
 * consumes. Returns null when the value is not prose-shaped.
 */
export function asParagraphs(after: unknown): ReviewParagraph[] | null {
  if (typeof after === "string") {
    return after.trim() ? [{ text: after.trim() }] : null;
  }
  if (Array.isArray(after)) {
    const collected: ReviewParagraph[] = [];
    for (const entry of after) {
      if (typeof entry === "string") {
        if (entry.trim()) collected.push({ text: entry.trim() });
        continue;
      }
      if (typeof entry !== "object" || entry === null) return null;
      const record: Record<string, unknown> = { ...entry };
      const text = proseFieldOf(record);
      if (!text) return null;
      collected.push({ text, source_ids: sourceIdsOf(record) });
    }
    return collected.length ? collected : null;
  }
  if (typeof after !== "object" || after === null) return null;
  const record: Record<string, unknown> = { ...after };

  // `{ paragraphs: [...] }`, optionally alongside a heading.
  if (Array.isArray(record.paragraphs)) {
    const nested = asParagraphs(record.paragraphs);
    if (!nested) return null;
    const heading = typeof record.heading === "string" ? record.heading.trim() : "";
    return heading ? [{ text: heading }, ...nested] : nested;
  }

  const text = proseFieldOf(record);
  if (!text) return null;
  // A qualifier is a short lead-in the review model keeps beside the value.
  const qualifier = typeof record.qualifier === "string" ? record.qualifier.trim() : "";
  const combined = qualifier && !text.startsWith(qualifier) ? `${qualifier} ${text}` : text;
  return [{ text: combined, source_ids: sourceIdsOf(record) }];
}

/** A stored range plus, when the envelope names one, the stage it belongs to. */
export type RangeTarget = { stage?: string; range: Range };

/** Normalizes a range envelope into a stored triple. Returns null if not one. */
export function asRange(after: unknown): RangeTarget | null {
  if (typeof after === "string") {
    try {
      return { range: parseRangeText(after) };
    } catch {
      return null;
    }
  }
  if (typeof after !== "object" || after === null || Array.isArray(after)) return null;
  const record: Record<string, unknown> = { ...after };

  // Already a stored triple. An all-null triple is a deliberate "clear this
  // stage" write, not a missing value, so it is accepted rather than refused.
  if ("unit" in record && ("min" in record || "max" in record)) {
    const numericOrNull = (value: unknown): number | null =>
      typeof value === "number" ? value : value === null || value === undefined ? null : Number.NaN;
    const min = numericOrNull(record.min);
    const max = numericOrNull(record.max);
    if (Number.isNaN(min) || Number.isNaN(max)) return null;
    if (typeof record.unit !== "string") return null;
    return { range: { min, max, unit: record.unit } };
  }

  // `{ stage, duration }` names its own target stage; `{ value }` does not.
  const stage = typeof record.stage === "string" ? record.stage.trim() : "";
  const rangeText = ["duration", "value", "text"]
    .map((key) => (typeof record[key] === "string" ? String(record[key]) : ""))
    .find(Boolean);
  if (!rangeText) return null;
  try {
    const range = parseRangeText(rangeText);
    return stage ? { stage, range } : { range };
  } catch {
    return null;
  }
}
/** Canonical stage key for a human stage label used by the review model. */
const STAGE_KEY_BY_LABEL: Record<string, string> = {
  onset: "onset",
  "come up": "come_up",
  "coming up": "come_up",
  comeup: "come_up",
  come_up: "come_up",
  peak: "peak",
  plateau: "peak",
  offset: "offset",
  "coming down": "offset",
  "after effects": "after_effects",
  aftereffects: "after_effects",
  after_effects: "after_effects",
  "normal after effects": "after_effects",
  "total duration": "total_duration",
  total: "total_duration",
  total_duration: "total_duration",
  duration: "total_duration",
};

const STAGE_KEYS: Record<string, true> = {
  onset: true,
  come_up: true,
  peak: true,
  offset: true,
  after_effects: true,
  total_duration: true,
};

/**
 * Normalizes a duration-stage map, e.g.
 * `{ onset: "20-60 minutes", total_duration: "4-8 hours" }`.
 *
 * Refuses when the envelope carries any key that is not a stage. Those extra
 * keys - `scope`, `uncertainty`, `note` - are prose that has to land in a real
 * field, and silently dropping them would lose reviewed evidence.
 */
export function asStageMap(after: unknown): Record<string, Range> | null {
  if (typeof after !== "object" || after === null || Array.isArray(after)) return null;
  const record: Record<string, unknown> = { ...after };
  const keys = Object.keys(record);
  if (!keys.length || keys.some((key) => !STAGE_KEYS[key])) return null;
  const mapped: Record<string, Range> = {};
  for (const key of keys) {
    const raw = record[key];
    if (raw === null || raw === undefined) continue;
    const normalized = asRange(raw);
    if (!normalized) return null;
    mapped[key] = normalized.range;
  }
  return Object.keys(mapped).length ? mapped : null;
}

/** Canonical stored stage key for a human stage label, or null if not a stage. */
export function stageKeyFor(label: string): string | null {
  return STAGE_KEY_BY_LABEL[String(label ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Canonical stored dose tier for a human tier label. The review model and older
 * sources say "common" where this schema stores `moderate`
 * (src/schema/substance/dosage.ts:6-11).
 */
const DOSE_TIER_BY_LABEL: Record<string, string> = {
  threshold: "threshold",
  light: "light",
  common: "moderate",
  moderate: "moderate",
  strong: "strong",
  heavy: "heavy",
};

export function doseTierFor(label: string): string | null {
  return DOSE_TIER_BY_LABEL[String(label ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Normalizes a stage LIST - `[{ stage: "Onset", duration: "30-60 minutes" }]` -
 * into the same stage map, translating each human label to its stored key.
 */
export function asStageList(after: unknown): Record<string, Range> | null {
  if (!Array.isArray(after) || !after.length) return null;
  const mapped: Record<string, Range> = {};
  for (const entry of after) {
    if (typeof entry !== "object" || entry === null) return null;
    const record: Record<string, unknown> = { ...entry };
    const label = typeof record.stage === "string" ? record.stage.trim().toLowerCase() : "";
    const key = STAGE_KEY_BY_LABEL[label];
    if (!key) return null;
    const normalized = asRange(record);
    if (!normalized) return null;
    mapped[key] = normalized.range;
  }
  return Object.keys(mapped).length ? mapped : null;
}

/** Normalizes a binding-site array. Returns null when the value is not one. */
export function asBindingSites(after: unknown): StoredBindingSite[] | null {
  const entries = Array.isArray(after) ? after : [after];
  const mapped: StoredBindingSite[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) return null;
    const record: Record<string, unknown> = { ...entry };
    const hasTarget =
      typeof record.target === "string" ||
      typeof record.site === "string" ||
      typeof record.receptor === "string";
    if (!hasTarget) return null;
    try {
      mapped.push(mapBindingSite(record));
    } catch {
      return null;
    }
  }
  return mapped.length ? mapped : null;
}

/** The stored legality country entry (src/schema/substance/shared.ts:102-108). */
export type StoredCountryLegality = {
  status: string;
  notes: string;
  canonicalStatus?: string;
  instrument?: string;
  designation?: string;
  citationNeeded?: boolean;
};

const CANONICAL_LEGAL_STATUSES: Record<string, true> = {
  prohibited: true,
  analog_covered: true,
  precursor_controlled: true,
  prescription_only: true,
  decriminalized: true,
  legal_regulated: true,
  unscheduled: true,
  restricted_other: true,
};

/**
 * Normalizes a legality country envelope. `status` and `notes` are required in
 * storage, and `canonicalStatus` must be one of the eight canonical values -
 * the badge label is derived from it, so a display string must never land here
 * (LegalitySection.tsx:213-218).
 */
export function asCountryLegality(
  after: unknown,
): { entry: StoredCountryLegality; noteParagraphs: ReviewParagraph[] | null } | null {
  if (typeof after !== "object" || after === null || Array.isArray(after)) return null;
  const record: Record<string, unknown> = { ...after };

  // Each field may arrive bare or wrapped as `{ value, source_ids }`.
  const unwrap = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const inner = Reflect.get(value, "value");
      if (typeof inner === "string") return inner.trim();
    }
    return "";
  };

  const status = unwrap(record.status);
  if (!status) return null;

  // `notes` is required prose in storage but arrives here as a string, a
  // `{ value }` wrapper, or a paragraph array that needs cite markers.
  const rawNotes = record.notes ?? record.text ?? record.content ?? "";
  const noteParagraphs = Array.isArray(rawNotes) ? asParagraphs(rawNotes) : null;
  if (Array.isArray(rawNotes) && !noteParagraphs) return null;
  const entry: StoredCountryLegality = {
    status,
    notes: noteParagraphs ? "" : unwrap(rawNotes),
  };

  const canonical = unwrap(record.canonicalStatus);
  if (canonical) {
    // The badge label is derived from this value, so an out-of-vocabulary
    // string must never be stored (LegalitySection.tsx:213-218).
    if (!CANONICAL_LEGAL_STATUSES[canonical]) return null;
    entry.canonicalStatus = canonical;
  }
  const instrument = unwrap(record.instrument);
  if (instrument) entry.instrument = instrument;
  const designation = unwrap(record.designation);
  if (designation) entry.designation = designation;
  if (typeof record.citationNeeded === "boolean") entry.citationNeeded = record.citationNeeded;
  return { entry, noteParagraphs };
}

/**
 * Normalizes a named-item list (metabolites, cross-tolerance entries) into the
 * stored array of prose strings.
 */
export function asNamedItems(after: unknown): { items: string[]; sourceIds: string[] } | null {
  if (!Array.isArray(after) || !after.length) return null;
  const items: string[] = [];
  const sourceIds = new Set<string>();
  for (const entry of after) {
    if (typeof entry === "string") {
      if (!entry.trim()) return null;
      items.push(entry.trim());
      continue;
    }
    if (typeof entry !== "object" || entry === null) return null;
    const record: Record<string, unknown> = { ...entry };
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return null;
    const detailKeys = ["details", "formation", "evidence", "relationship", "qualifier", "status"];
    const detail = detailKeys
      .map((key) => (typeof record[key] === "string" ? String(record[key]).trim() : ""))
      .filter(Boolean)
      .join("; ");
    for (const id of sourceIdsOf(record)) sourceIds.add(id);
    items.push(detail ? `${name} — ${detail}` : name);
  }
  return { items, sourceIds: [...sourceIds] };
}

/**
 * Every candidate source id reachable from a value, in first-seen order.
 *
 * Ids arrive two ways: in a `source_ids` array, and embedded directly in prose
 * as `[cite:S1]`. Both must be collected, because a record whose evidence is
 * only cited inline would otherwise merge no references and leave the markers
 * pointing at nothing.
 */
export function collectSourceIds(value: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const remember = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    found.push(id);
  };
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      for (const match of node.matchAll(CITE_TOKEN_PATTERN)) remember(match[1]);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record: Record<string, unknown> = { ...node };
    for (const id of sourceIdsOf(record)) remember(id);
    for (const [key, child] of Object.entries(record)) {
      if (key === "source_ids" || key === "reference_ids" || key === "sourceIds") continue;
      walk(child);
    }
  };
  walk(value);
  return found;
}
