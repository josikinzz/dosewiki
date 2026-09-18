import type {
  AggregationPolicy,
  AggregationPolicySet,
  ParsedSourceRecord,
} from "./contracts";
import type {
  NarrativeContent,
  ParsedChemistry,
  ParsedHarmReduction,
  ParsedPharmacology,
  ParsedSubstanceData,
  ParserResult,
} from "./types";

export const pharmacologySourcePriority: Record<string, number> = {
  drugbank: 1,
  psychonautwiki: 2,
  wikipedia: 3,
};

const pharmacologyFields = [
  "halfLife",
  "bioavailability",
  "metabolism",
  "receptors",
  "mechanismOfAction",
] as const;

type ParsedArrayField =
  | "dosage"
  | "duration"
  | "effects"
  | "interactions"
  | "legal"
  | "internationalLaw";

function createEmptyAggregate(slug: string, name: string): ParsedSubstanceData {
  return {
    slug,
    name,
    dosage: [],
    duration: [],
    effects: [],
    interactions: [],
    legal: [],
    internationalLaw: [],
    narrativeContent: {
      experienceReports: [],
      synthesis: [],
      qualitativeComments: [],
      generalNotes: [],
    },
    sourcesCoverage: [],
  };
}

function appendArrayFieldsPolicy(fields: ParsedArrayField[]): AggregationPolicy {
  return {
    merge(aggregate, { result }) {
      return fields.reduce(
        (nextAggregate, field) => ({
          ...nextAggregate,
          [field]: [...nextAggregate[field], ...result[field]],
        }),
        aggregate,
      );
    },
  };
}

function mergeChemistry(
  aggregateChemistry: ParsedChemistry | undefined,
  resultChemistry: ParserResult["chemistry"],
): ParsedChemistry | undefined {
  if (!resultChemistry) {
    return aggregateChemistry;
  }

  if (!aggregateChemistry) {
    return { ...resultChemistry } as ParsedChemistry;
  }

  const nextChemistry = {
    ...aggregateChemistry,
    sources: [
      ...(aggregateChemistry.sources || []),
      ...(resultChemistry.sources || []),
    ],
  } as ParsedChemistry;

  for (const [key, value] of Object.entries(resultChemistry)) {
    const chemistryFields = nextChemistry as unknown as Record<string, unknown>;
    if (key !== "sources" && value && !chemistryFields[key]) {
      chemistryFields[key] = value;
    }
  }

  return nextChemistry;
}

function chemistryPolicy(): AggregationPolicy {
  return {
    merge(aggregate, { result }) {
      const chemistry = mergeChemistry(aggregate.chemistry, result.chemistry);
      return chemistry ? { ...aggregate, chemistry } : aggregate;
    },
  };
}

function pharmacologyPolicy(): AggregationPolicy {
  const candidates: Array<{
    sourceId: string;
    pharmacology: ParserResult["pharmacology"];
  }> = [];

  return {
    merge(aggregate, { sourceId, result }) {
      if (!result.pharmacology) {
        return aggregate;
      }

      candidates.push({ sourceId, pharmacology: result.pharmacology });

      const pharmacology = {
        ...(aggregate.pharmacology || { sources: [] }),
        sources: [
          ...(aggregate.pharmacology?.sources || []),
          ...(result.pharmacology.sources || []),
        ],
      } as ParsedPharmacology;

      return { ...aggregate, pharmacology };
    },
    finalize(aggregate) {
      if (!aggregate.pharmacology) {
        return aggregate;
      }

      const pharmacology = { ...aggregate.pharmacology } as ParsedPharmacology;
      const prioritizedCandidates = [...candidates].sort((left, right) => {
        const leftPriority = pharmacologySourcePriority[left.sourceId] ?? 99;
        const rightPriority = pharmacologySourcePriority[right.sourceId] ?? 99;
        return leftPriority - rightPriority;
      });

      for (const { pharmacology: sourceData } of prioritizedCandidates) {
        for (const field of pharmacologyFields) {
          if (sourceData?.[field] && !pharmacology[field]) {
            (pharmacology as unknown as Record<string, unknown>)[field] = sourceData[field];
          }
        }
      }

      return { ...aggregate, pharmacology };
    },
  };
}

function mergeHarmReduction(
  aggregateHarmReduction: ParsedHarmReduction | undefined,
  resultHarmReduction: ParserResult["harmReduction"],
): ParsedHarmReduction | undefined {
  if (!resultHarmReduction) {
    return aggregateHarmReduction;
  }

  if (!aggregateHarmReduction) {
    return { ...resultHarmReduction } as ParsedHarmReduction;
  }

  return {
    ...aggregateHarmReduction,
    rules: [
      ...(aggregateHarmReduction.rules || []),
      ...(resultHarmReduction.rules || []),
    ],
    shortTermRisks: [
      ...(aggregateHarmReduction.shortTermRisks || []),
      ...(resultHarmReduction.shortTermRisks || []),
    ],
    longTermRisks: [
      ...(aggregateHarmReduction.longTermRisks || []),
      ...(resultHarmReduction.longTermRisks || []),
    ],
    contraindications: [
      ...(aggregateHarmReduction.contraindications || []),
      ...(resultHarmReduction.contraindications || []),
    ],
    sources: [
      ...(aggregateHarmReduction.sources || []),
      ...(resultHarmReduction.sources || []),
    ],
  };
}

function harmReductionPolicy(): AggregationPolicy {
  return {
    merge(aggregate, { result }) {
      const harmReduction = mergeHarmReduction(
        aggregate.harmReduction,
        result.harmReduction,
      );
      return harmReduction ? { ...aggregate, harmReduction } : aggregate;
    },
  };
}

function tolerancePolicy(): AggregationPolicy {
  return {
    merge(aggregate, { result }) {
      if (!result.tolerance) {
        return aggregate;
      }

      return {
        ...aggregate,
        tolerance: [...(aggregate.tolerance || []), result.tolerance],
      };
    },
  };
}

function narrativeContentPolicy(): AggregationPolicy {
  return {
    merge(aggregate, { result }) {
      const narrativeContent = result.narrativeContent;

      return {
        ...aggregate,
        narrativeContent: {
          experienceReports: [
            ...aggregate.narrativeContent.experienceReports,
            ...(narrativeContent.experienceReports || []),
          ],
          synthesis: [
            ...aggregate.narrativeContent.synthesis,
            ...(narrativeContent.synthesis || []),
          ],
          qualitativeComments: [
            ...aggregate.narrativeContent.qualitativeComments,
            ...(narrativeContent.qualitativeComments || []),
          ],
          generalNotes: [
            ...aggregate.narrativeContent.generalNotes,
            ...(narrativeContent.generalNotes || []),
          ],
        } satisfies NarrativeContent,
      };
    },
  };
}

function sourceCoveragePolicy(): AggregationPolicy {
  return {
    merge(aggregate, { sourceId, displayName, result, tokens }) {
      return {
        ...aggregate,
        sourcesCoverage: [
          ...aggregate.sourcesCoverage,
          {
            sourceId,
            displayName,
            sectionsExtracted: result.sectionsExtracted,
            tokensOriginal: tokens,
          },
        ],
      };
    },
  };
}

export function createDefaultAggregationPolicySet(
  slug: string,
  name: string,
): AggregationPolicySet {
  return {
    slug,
    name,
    policies: [
      appendArrayFieldsPolicy([
        "dosage",
        "duration",
        "effects",
        "interactions",
        "legal",
        "internationalLaw",
      ]),
      chemistryPolicy(),
      pharmacologyPolicy(),
      harmReductionPolicy(),
      tolerancePolicy(),
      narrativeContentPolicy(),
      sourceCoveragePolicy(),
    ],
  };
}

export function aggregateParsedSources(
  records: ParsedSourceRecord[],
  policySet: AggregationPolicySet,
): ParsedSubstanceData {
  let aggregate = createEmptyAggregate(policySet.slug, policySet.name);

  for (const record of records) {
    for (const policy of policySet.policies) {
      aggregate = policy.merge(aggregate, record);
    }
  }

  for (const policy of policySet.policies) {
    if (policy.finalize) {
      aggregate = policy.finalize(aggregate);
    }
  }

  return aggregate;
}
