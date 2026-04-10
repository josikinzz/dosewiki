import { slugify } from "../../utils/slug";
import type {
  Interactions,
  Tolerance,
} from "../../schema";
import type {
  InteractionGroup,
  InteractionTarget,
  ToleranceEntry,
} from "../../types/content";
import { cleanString, cleanStringArray, titleize } from "./contentBuilderShared";

type InteractionSeverity = InteractionGroup["severity"];

const INTERACTION_LABELS: Record<InteractionSeverity, string> = {
  danger: "Dangerous combinations",
  unsafe: "Unsafe combinations",
  caution: "Use caution",
};

function extractInteractionDetails(value: string): { base: string; rationale?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { base: "" };
  }

  const trailingRationale = trimmed.match(/^(.*?)(?:\s*\(([^()]*)\)\s*)$/);
  if (!trailingRationale) {
    return { base: trimmed };
  }

  const base = trailingRationale[1]?.trim() ?? "";
  const rationale = trailingRationale[2]?.trim();
  if (base.length === 0) {
    return { base: trimmed };
  }

  return rationale && rationale.length > 0 ? { base, rationale } : { base };
}

function normalizeInteractionLabel(value: string): string {
  return value
    .replace(/[‒–—−]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*([/,&])\s*/g, " $1 ")
    .trim();
}

function hashInteractionLabel(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildInteractionItem(entry: string): InteractionTarget {
  const raw = entry.trim();
  const { base, rationale } = extractInteractionDetails(raw);
  const normalizedBase = normalizeInteractionLabel(base);
  const displayCandidate = normalizedBase.length > 0 ? normalizedBase : normalizeInteractionLabel(raw);
  const fallbackDisplay = displayCandidate.length > 0 ? displayCandidate : raw;

  let slug = slugify(displayCandidate);
  if (!slug) {
    slug = slugify(raw);
  }
  if (!slug) {
    slug = `interaction-${hashInteractionLabel(raw)}`;
  }

  return {
    raw,
    display: fallbackDisplay,
    slug,
    rationale: rationale && rationale.length > 0 ? rationale : undefined,
    matchType: "unknown",
  };
}

export function buildInteractionGroups(interactions: Interactions | undefined): InteractionGroup[] {
  if (!interactions) {
    return [];
  }

  const severityOrder: InteractionSeverity[] = ["danger", "unsafe", "caution"];

  return severityOrder
    .map((severity) => {
      const listKey = severity === "danger" ? "dangerous" : severity;
      const rawItems = (interactions as Record<string, unknown>)[listKey];
      const items = cleanStringArray(rawItems).map((entry) => buildInteractionItem(entry));

      if (items.length === 0) {
        return null;
      }

      return {
        label: INTERACTION_LABELS[severity],
        severity,
        items,
      };
    })
    .filter((group): group is InteractionGroup => group !== null);
}

export function buildToleranceEntries(tolerance: Tolerance | undefined): ToleranceEntry[] {
  if (!tolerance) {
    return [];
  }

  const entries: ToleranceEntry[] = [];

  const full = cleanString(tolerance.full_tolerance);
  if (full) {
    entries.push({ label: "Full tolerance", description: full });
  }

  const half = cleanString(tolerance.half_tolerance);
  if (half) {
    entries.push({ label: "Half tolerance", description: half });
  }

  const baseline = cleanString(tolerance.baseline_tolerance);
  if (baseline) {
    entries.push({ label: "Baseline reset", description: baseline });
  }

  const cross = cleanStringArray(tolerance.cross_tolerance);
  if (cross.length > 0) {
    entries.push({ label: "Cross tolerance", description: cross.map(titleize).join(", ") });
  }

  return entries;
}
