import type { SubstanceArticle } from "@/schema";
import { getNumber, getObject, getString } from "./yamlParserShared";

type HarmPotential = NonNullable<SubstanceArticle["harm_potential"]>;
type Toxicity = NonNullable<HarmPotential["toxicity"]>;
type Addiction = NonNullable<HarmPotential["addiction"]>;
type RiskField = NonNullable<HarmPotential["psychosis"]>;
type CarcinogenicityDetails = Exclude<NonNullable<Toxicity["carcinogenicity"]>, string>;
type AntibioticFunctionDetails = Exclude<NonNullable<Toxicity["antibiotic_function"]>, string>;

const RISK_LEVEL_MAP = {
  "Very High": "extremely_high",
  High: "high",
  Moderate: "moderate",
  Low: "low",
  "Very Low": "extremely_low",
} as const satisfies Record<string, RiskField["level"]>;

function hasValues(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function normalizeRiskField(raw: unknown): RiskField | undefined {
  const field = getObject(raw);
  if (!hasValues(field)) {
    return undefined;
  }

  return {
    level: typeof field.level === "string" ? RISK_LEVEL_MAP[field.level] ?? null : null,
    description: getString(field.description),
  };
}

function normalizeLd50(
  raw: unknown,
): Toxicity["ld50"] | undefined {
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const item = getObject(entry);
      return {
        species: getString(item.species),
        route: getString(item.route),
        value: getNumber(item.value),
        unit: getString(item.unit),
      };
    });
  }

  return typeof raw === "string" && raw ? raw : undefined;
}

function normalizeOrganToxicity(
  raw: unknown,
): Toxicity["organ_toxicity"] | undefined {
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const item = getObject(entry);
      return {
        system: getString(item.system),
        findings: getString(item.findings),
        mechanism: getString(item.mechanism),
        notes: getString(item.notes),
      };
    });
  }

  return typeof raw === "string" && raw ? raw : undefined;
}

function normalizeCarcinogenicity(
  raw: unknown,
): Toxicity["carcinogenicity"] | undefined {
  if (typeof raw === "string" && raw) {
    return raw;
  }

  const item = getObject(raw);
  if (!hasValues(item)) {
    return undefined;
  }

  return {
    level: (item.level as CarcinogenicityDetails["level"] | undefined) ?? null,
    evidence: item.evidence as CarcinogenicityDetails["evidence"],
    description: getString(item.description),
  };
}

function normalizeAntibioticFunction(
  raw: unknown,
): Toxicity["antibiotic_function"] | undefined {
  const item = getObject(raw);
  if (!hasValues(item)) {
    return undefined;
  }

  return {
    level: (item.level as AntibioticFunctionDetails["level"] | undefined) ?? null,
    description: getString(item.description),
  };
}

function normalizeToxicity(raw: unknown): HarmPotential["toxicity"] | undefined {
  const toxicity = getObject(raw);
  if (!hasValues(toxicity)) {
    return undefined;
  }

  const normalized: Toxicity = {};
  const ld50 = normalizeLd50(toxicity.ld50);
  const organToxicity = normalizeOrganToxicity(toxicity.organ_toxicity);
  const carcinogenicity = normalizeCarcinogenicity(toxicity.carcinogenicity);
  const antibioticFunction = normalizeAntibioticFunction(toxicity.antibiotic_function);

  if (ld50 !== undefined) {
    normalized.ld50 = ld50;
  }

  if (organToxicity !== undefined) {
    normalized.organ_toxicity = organToxicity;
  }

  if (carcinogenicity !== undefined) {
    normalized.carcinogenicity = carcinogenicity;
  }

  if (antibioticFunction !== undefined) {
    normalized.antibiotic_function = antibioticFunction;
  }

  if (toxicity.other) {
    (normalized as Record<string, unknown>).other = getString(toxicity.other);
  }

  return hasValues(normalized) ? normalized : undefined;
}

function normalizeDependenceField(raw: unknown): Addiction["psychological"] | undefined {
  const item = getObject(raw);
  if (!hasValues(item)) {
    return undefined;
  }

  return {
    level: item.level as Addiction["psychological"]["level"],
    description: getString(item.description),
  };
}

function normalizeAddiction(raw: unknown): HarmPotential["addiction"] | undefined {
  const addiction = getObject(raw);
  if (!hasValues(addiction)) {
    return undefined;
  }

  const normalized: Addiction = {};
  const psychological = normalizeDependenceField(addiction.psychological);
  const physicalDependence = normalizeDependenceField(addiction.physical_dependence);

  if (psychological !== undefined) {
    normalized.psychological = psychological;
  }

  if (physicalDependence !== undefined) {
    normalized.physical_dependence = physicalDependence;
  }

  return hasValues(normalized) ? normalized : undefined;
}

export function normalizeHarmPotential(raw: unknown): SubstanceArticle["harm_potential"] {
  if (!raw) {
    return undefined;
  }

  const source = getObject(raw);
  const normalized: HarmPotential = {
    ...(source as Record<string, unknown>),
    addiction: normalizeAddiction(source.addiction),
    toxicity: normalizeToxicity(source.toxicity),
    psychosis: normalizeRiskField(source.psychosis),
    seizure: normalizeRiskField(source.seizure),
  };

  if (!normalized.addiction) {
    delete normalized.addiction;
  }

  if (!normalized.toxicity) {
    delete normalized.toxicity;
  }

  if (!normalized.psychosis) {
    delete normalized.psychosis;
  }

  if (!normalized.seizure) {
    delete normalized.seizure;
  }

  return normalized;
}
