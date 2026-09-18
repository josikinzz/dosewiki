import { publicHref } from "@/utils/publicHref";

// Convert mechanism text to slug for navigation
function mechanismToSlug(moa: string): string {
  return moa
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Parse mechanism entry to extract base name and optional qualifier
export function parseMechanismEntry(entry: string): {
  base: string;
  qualifier?: string;
} {
  const match = entry.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const base = match[1].trim();
    const qualifier = match[2]?.trim();
    if (base.length > 0) {
      return {
        base,
        qualifier: qualifier && qualifier.length > 0 ? qualifier : undefined,
      };
    }
  }
  return { base: entry.trim() };
}

/**
 * Activity phrases that can trail a binding-site name in a mechanism label.
 * Ordered longest-first so "partial agonist" wins over "agonist" and
 * "reuptake inhibitor" over "inhibitor".
 */
const MECHANISM_ACTIVITY_PHRASES = [
  "positive allosteric modulator",
  "negative allosteric modulator",
  "allosteric modulator",
  "reuptake inhibitor",
  "releasing agent",
  "partial agonist",
  "inverse agonist",
  "co-agonist",
  "antagonist",
  "modulator",
  "inhibitor",
  "agonist",
  "blocker",
  "ligand",
  "agent",
];

/**
 * Splits "5-HT2A receptor agonist" into the site ("5-HT2A receptor") and the
 * activity ("agonist") so the row's citation marker can sit beside the binding
 * site itself rather than trailing the whole mechanism. Labels that carry no
 * recognised activity phrase — a bare target like "TAAR1", or free prose — stay
 * whole and keep the marker at the end.
 */
export function splitMechanismActivity(base: string): {
  site: string;
  activity?: string;
} {
  const lower = base.toLowerCase();
  for (const phrase of MECHANISM_ACTIVITY_PHRASES) {
    if (!lower.endsWith(` ${phrase}`)) continue;
    const site = base.slice(0, base.length - phrase.length - 1).trimEnd();
    if (site.length > 0) {
      return { site, activity: base.slice(base.length - phrase.length) };
    }
  }
  return { site: base };
}

export function getMechanismPath(base: string, qualifier?: string) {
  const baseSlug = mechanismToSlug(base);
  const qualifierSlug = qualifier ? mechanismToSlug(qualifier) : undefined;

  return {
    baseSlug,
    qualifierSlug,
    href: publicHref.mechanism(baseSlug, qualifierSlug),
  };
}
