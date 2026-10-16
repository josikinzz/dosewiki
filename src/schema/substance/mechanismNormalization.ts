import { slugify } from "../../utils/slug";
import { stripCitationTokens } from "../../lib/citations/citationTokens";

export const UNQUALIFIED_MECHANISM_QUALIFIER_KEY = "unqualified";

export interface QualifiedMechanismLabel {
  base: string;
  qualifier?: string;
  qualifierKey: string;
}

export interface NormalizedMechanism {
  label: string;
  base: string;
  slug: string;
  qualifier?: string;
  qualifierSlug?: string;
}

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
