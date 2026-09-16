import {
  isDirectUrlOnlySubstance,
  isHiddenSubstance,
  UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
  normalizeMechanisms,
  type NormalizedMechanism,
  type SubstancePriority,
} from "../../schema";
import type { MechanismSummary } from "./library";
import { normalizeTaxonomyKey } from "./taxonomy";

const OBSCURE_INDEX_KEY = "obscure";

export interface MechanismRouteSubstanceInput {
  displayName: string | null;
  priority?: SubstancePriority | null;
  indexCategories: readonly string[];
  mechanisms: readonly NormalizedMechanism[];
}

export interface MechanismRouteSource<TRecord> extends MechanismRouteSubstanceInput {
  record: TRecord;
}

interface MechanismQualifierAccumulator<TRecord> {
  key: string;
  label: string;
  qualifier?: string;
  records: Set<TRecord>;
}

export interface MechanismAccumulator<TRecord> {
  name: string;
  records: Set<TRecord>;
  qualifierMap: Map<string, MechanismQualifierAccumulator<TRecord>>;
  qualifiers: MechanismQualifierAccumulator<TRecord>[];
  defaultQualifierKey: string;
}

export interface MechanismRouteDerivation<TRecord> {
  mechanismMap: Map<string, MechanismAccumulator<TRecord>>;
  mechanismSummaries: MechanismSummary[];
}

function isExcludedFromMechanismRoutes(source: MechanismRouteSubstanceInput): boolean {
  const normalizedIndexCategories = source.indexCategories
    .map((category) => normalizeTaxonomyKey(category))
    .filter(Boolean);

  return (
    !source.displayName ||
    isHiddenSubstance(normalizedIndexCategories) ||
    isDirectUrlOnlySubstance(source.priority) ||
    normalizedIndexCategories.includes(OBSCURE_INDEX_KEY)
  );
}

/**
 * Canonical mechanism route/index derivation.
 *
 * Both the full public library and the slim static-route read flow through this
 * function so filtering, summary order, qualifier order, and default selection
 * cannot diverge.
 *
 * The slim projection shares the library's canonical pharmacology view but
 * intentionally does not apply the full article schema. A stored record that
 * is malformed outside pharmacology can therefore keep a mechanism route after
 * the validated library has dropped that article. Avoiding a full Zod parse of
 * every article inside the Postgres query is the deliberate tradeoff.
 */
export function deriveMechanismRouteData<TRecord>(
  sources: readonly MechanismRouteSource<TRecord>[],
): MechanismRouteDerivation<TRecord> {
  const mechanismMap = new Map<string, MechanismAccumulator<TRecord>>();

  for (const source of sources) {
    if (isExcludedFromMechanismRoutes(source) || source.mechanisms.length === 0) {
      continue;
    }

    for (const mechanism of source.mechanisms) {
      const [normalizedMechanism] = normalizeMechanisms([
        mechanism.label || mechanism.base,
      ]);
      if (!normalizedMechanism) {
        continue;
      }

      const normalizedBase = normalizedMechanism.base;
      const slug = normalizedMechanism.slug;

      let accumulator = mechanismMap.get(slug);
      if (!accumulator) {
        accumulator = {
          name: normalizedBase,
          records: new Set(),
          qualifierMap: new Map(),
          qualifiers: [],
          defaultQualifierKey: UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
        };
        mechanismMap.set(slug, accumulator);
      }

      accumulator.records.add(source.record);

      const qualifierKey =
        normalizedMechanism.qualifierSlug ??
        UNQUALIFIED_MECHANISM_QUALIFIER_KEY;
      let qualifier = accumulator.qualifierMap.get(qualifierKey);
      if (!qualifier) {
        qualifier = {
          key: qualifierKey,
          label: normalizedMechanism.qualifier ?? "General (no qualifier)",
          qualifier: normalizedMechanism.qualifier,
          records: new Set(),
        };
        accumulator.qualifierMap.set(qualifierKey, qualifier);
      }
      qualifier.records.add(source.record);
    }
  }

  for (const accumulator of mechanismMap.values()) {
    accumulator.qualifiers = Array.from(accumulator.qualifierMap.values()).sort(
      (left, right) => {
        if (left.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) return -1;
        if (right.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) return 1;
        return left.label.localeCompare(right.label);
      },
    );
    accumulator.defaultQualifierKey =
      accumulator.qualifiers.find(
        (qualifier) =>
          qualifier.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
      )?.key ??
      accumulator.qualifiers[0]?.key ??
      UNQUALIFIED_MECHANISM_QUALIFIER_KEY;
  }

  const mechanismSummaries = Array.from(mechanismMap.entries())
    .map(([slug, entry]) => ({
      name: entry.name,
      slug,
      total: entry.records.size,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { mechanismMap, mechanismSummaries };
}
