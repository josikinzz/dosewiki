import { slugify } from "../../utils/slug";
import { stripCitationTokens } from "../../lib/citations/citationTokens";

/**
 * Mechanism normalization owns the substance-side rules for turning raw
 * `mechanism_of_action` tags into stable, deduplicated identifiers:
 * qualifier parsing (`"5-HT2A receptor agonist (partial agonist)"`),
 * slug derivation via the canonical slugify, and `slug + qualifier` dedupe.
 *
 * Builders (src/data/builders) delegate here; this module must stay free of
 * imports from the data/builder layer. Postgres ingestion does not rewrite
 * stored mechanism tags with this yet — it is exported so ingestion can adopt
 * it later without changing stored data today.
 */

/** Qualifier key used when a mechanism label carries no `(qualifier)` suffix. */
export const UNQUALIFIED_MECHANISM_QUALIFIER_KEY = "unqualified";

export interface QualifiedMechanismLabel {
  base: string;
  qualifier?: string;
  qualifierKey: string;
}

export interface NormalizedMechanism {
  /** Citation-free, trimmed label, including any qualifier suffix. */
  label: string;
  /** Label with the trailing `(qualifier)` removed. */
  base: string;
  /** Canonical slug of the base label. */
  slug: string;
  /** Human-readable qualifier, when present. */
  qualifier?: string;
  /** Canonical slug of the qualifier, when present. */
  qualifierSlug?: string;
}

/**
 * Split a label of the form `"Base (Qualifier)"` into its base and qualifier.
 * Labels without a trailing parenthetical resolve to the unqualified key.
 */
export function parseQualifiedMechanismLabel(entry: string): QualifiedMechanismLabel {
  const trimmed = entry.trim();
  if (trimmed.length === 0) {
    return {
      base: trimmed,
      qualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
    };
  }

  const match = trimmed.match(/^(.*?)(?:\s*\(([^()]+)\))$/);
  if (match) {
    const base = match[1]?.trim() ?? "";
    const qualifier = match[2]?.trim();
    if (base.length > 0) {
      return {
        base,
        qualifier: qualifier && qualifier.length > 0 ? qualifier : undefined,
        qualifierKey: qualifier ? slugify(qualifier) : UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
      };
    }
  }

  return {
    base: trimmed,
    qualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
  };
}

/**
 * Normalize raw mechanism tags into deduplicated mechanism records.
 * Blank entries, entries whose base is empty, and entries whose base slugs to
 * nothing are dropped; duplicates collapse on `slug + qualifierKey`.
 */
export function normalizeMechanisms(mechanismTags: string[]): NormalizedMechanism[] {
  const seen = new Set<string>();
  const mechanisms: NormalizedMechanism[] = [];

  mechanismTags.forEach((entry) => {
    const label = stripCitationTokens(entry);
    if (!label) {
      return;
    }

    const { base, qualifier, qualifierKey } = parseQualifiedMechanismLabel(label);
    const normalizedBase = base.trim();
    if (!normalizedBase) {
      return;
    }

    const slug = slugify(normalizedBase);
    if (!slug) {
      return;
    }

    const dedupeKey = `${slug}::${qualifierKey}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    mechanisms.push({
      label,
      base: normalizedBase,
      slug,
      qualifier,
      qualifierSlug: qualifier ? qualifierKey : undefined,
    });
  });

  return mechanisms;
}
