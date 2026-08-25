export type AuditStatus =
  | "exact_match"
  | "structure_mismatch"
  | "name_unparsed"
  | "smiles_invalid"
  | "missing_iupac"
  | "missing_smiles"
  | "missing_both"
  | "audit_error";

export type InchiDifference =
  | "exact"
  | "constitutional"
  | "charge_or_protonation"
  | "hydrogen_or_bonding"
  | "stereochemistry"
  | "other";

export interface ChemistryAuditRow {
  slug: string;
  title: string;
  smiles: string | null;
  iupacName: string | null;
  storedInchiKey: string | null;
}

export interface StructureResolution {
  status: "success" | "invalid" | "error" | "missing";
  inchi: string | null;
  inchiKey: string | null;
  canonicalSmiles: string | null;
  message?: string;
}

export interface OpsinResolution {
  status: "success" | "warning" | "unparsed" | "error" | "missing";
  message: string;
  smiles: string | null;
  standardInchi: string | null;
  standardInchiKey: string | null;
  httpStatus?: number;
}

export interface PubchemResolution {
  status: "success" | "not_found" | "ambiguous" | "error" | "missing";
  message: string;
  cid: number | null;
  title: string | null;
  iupacName: string | null;
  smiles: string | null;
  inchiKey: string | null;
  molecularFormula: string | null;
  recordCount: number;
  httpStatus?: number;
}

export interface InchiComparison {
  kind: InchiDifference;
  exact: boolean;
}

export interface ClassifiedAuditRow extends ChemistryAuditRow {
  status: AuditStatus;
  comparison: InchiComparison | null;
  sourceStructure: StructureResolution;
  currentName: {
    opsin: OpsinResolution;
    structure: StructureResolution;
  };
  pubchem: PubchemResolution;
  candidateRoundTrip: {
    name: string | null;
    opsin: OpsinResolution;
    structure: StructureResolution;
    comparison: InchiComparison | null;
  };
  computedInchiKey: string | null;
  storedInchiKeyMatches: boolean | null;
  recommendedCandidate: string | null;
  reviewReasons: string[];
}

interface ClassifyAuditRowInput {
  row: ChemistryAuditRow;
  sourceStructure: StructureResolution;
  currentNameOpsin: OpsinResolution;
  currentNameStructure: StructureResolution;
  pubchem: PubchemResolution;
  candidateOpsin: OpsinResolution;
  candidateStructure: StructureResolution;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}


export function extractChemistryAuditRows(articles: unknown[]): ChemistryAuditRow[] {
  return articles
    .map((article) => {
      const record = article && typeof article === "object" ? (article as Record<string, unknown>) : {};
      const slug = cleanString(record.slug) ?? "";
      const identification =
        record.identification && typeof record.identification === "object"
          ? (record.identification as Record<string, unknown>)
          : {};
      return {
        slug,
        title: cleanString(record.title) ?? slug,
        smiles: cleanString(identification.smiles),
        iupacName: cleanString(identification.iupac_name),
        storedInchiKey: cleanString(identification.inchi_key),
      };
    })
    .filter((row) => row.slug)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

function parseInchiLayers(inchi: string): Map<string, string> {
  const parts = inchi.split("/");
  const layers = new Map<string, string>();
  layers.set("header", parts[0] ?? "");
  layers.set("formula", parts[1] ?? "");
  for (const part of parts.slice(2)) {
    const key = part.match(/^[a-z]+/u)?.[0];
    if (!key) continue;
    layers.set(key, part.slice(key.length));
  }
  return layers;
}

function layerValue(layers: Map<string, string>, key: string): string {
  return layers.get(key) ?? "";
}

export function compareStandardInchi(left: string, right: string): InchiComparison {
  if (left === right) return { kind: "exact", exact: true };

  const leftLayers = parseInchiLayers(left);
  const rightLayers = parseInchiLayers(right);
  if (
    layerValue(leftLayers, "formula") !== layerValue(rightLayers, "formula") ||
    layerValue(leftLayers, "c") !== layerValue(rightLayers, "c")
  ) {
    return { kind: "constitutional", exact: false };
  }
  if (
    layerValue(leftLayers, "q") !== layerValue(rightLayers, "q") ||
    layerValue(leftLayers, "p") !== layerValue(rightLayers, "p")
  ) {
    return { kind: "charge_or_protonation", exact: false };
  }
  if (layerValue(leftLayers, "h") !== layerValue(rightLayers, "h")) {
    return { kind: "hydrogen_or_bonding", exact: false };
  }
  if (["b", "t", "m", "s"].some((key) => layerValue(leftLayers, key) !== layerValue(rightLayers, key))) {
    return { kind: "stereochemistry", exact: false };
  }
  return { kind: "other", exact: false };
}

function compareResolvedStructures(
  source: StructureResolution,
  candidate: StructureResolution,
): InchiComparison | null {
  if (source.status !== "success" || candidate.status !== "success" || !source.inchi || !candidate.inchi) {
    return null;
  }
  return compareStandardInchi(source.inchi, candidate.inchi);
}

function determineStatus(
  row: ChemistryAuditRow,
  source: StructureResolution,
  currentNameOpsin: OpsinResolution,
  currentNameComparison: InchiComparison | null,
): AuditStatus {
  if (!row.smiles && !row.iupacName) return "missing_both";
  if (!row.smiles) return "missing_smiles";
  if (!row.iupacName) return "missing_iupac";
  if (source.status === "invalid") return "smiles_invalid";
  if (source.status !== "success") return "audit_error";
  if (["unparsed", "error"].includes(currentNameOpsin.status)) return "name_unparsed";
  if (!currentNameComparison) return "audit_error";
  return currentNameComparison.exact ? "exact_match" : "structure_mismatch";
}

export function classifyAuditRow(input: ClassifyAuditRowInput): ClassifiedAuditRow {
  const {
    row,
    sourceStructure,
    currentNameOpsin,
    currentNameStructure,
    pubchem,
    candidateOpsin,
    candidateStructure,
  } = input;
  const comparison = compareResolvedStructures(sourceStructure, currentNameStructure);
  const candidateComparison = compareResolvedStructures(sourceStructure, candidateStructure);
  const status = determineStatus(row, sourceStructure, currentNameOpsin, comparison);
  const storedInchiKeyMatches =
    row.storedInchiKey && sourceStructure.inchiKey
      ? row.storedInchiKey === sourceStructure.inchiKey
      : null;
  const reviewReasons: string[] = [];

  if (status === "structure_mismatch") reviewReasons.push(`structure_mismatch:${comparison?.kind ?? "unknown"}`);
  if (status === "name_unparsed") reviewReasons.push("name_unparsed");
  if (status === "smiles_invalid") reviewReasons.push("smiles_invalid");
  if (status === "audit_error") reviewReasons.push("audit_error");
  if (storedInchiKeyMatches === false) reviewReasons.push("stored_inchi_key_mismatch");
  if (currentNameOpsin.status === "warning") reviewReasons.push("opsin_warning");

  const needsReplacementCandidate = status === "structure_mismatch" || status === "name_unparsed";
  if (needsReplacementCandidate && pubchem.status !== "success") {
    reviewReasons.push("replacement_candidate_unavailable");
  } else if (needsReplacementCandidate && !candidateComparison?.exact) {
    reviewReasons.push("replacement_candidate_not_round_trip_safe");
  }

  const recommendedCandidate =
    needsReplacementCandidate && candidateComparison?.exact && pubchem.iupacName
      ? pubchem.iupacName
      : null;

  return {
    ...row,
    status,
    comparison,
    sourceStructure,
    currentName: {
      opsin: currentNameOpsin,
      structure: currentNameStructure,
    },
    pubchem,
    candidateRoundTrip: {
      name: pubchem.iupacName,
      opsin: candidateOpsin,
      structure: candidateStructure,
      comparison: candidateComparison,
    },
    computedInchiKey: sourceStructure.inchiKey,
    storedInchiKeyMatches,
    recommendedCandidate,
    reviewReasons,
  };
}

export interface ChemistryAuditReport {
  schemaVersion: "iupac-name-audit-v1";
  generatedAt: string;
  source: {
    convexUrl: string;
    deployment: string;
  };
  providers: {
    rdkitVersion: string;
    opsinEndpoint: string;
    pubchemEndpoint: string;
  };
  semantics: {
    passCondition: string;
    candidatePolicy: string;
    nonGoals: string[];
  };
  summary: {
    total: number;
    withSmiles: number;
    withIupac: number;
    withBoth: number;
    statusCounts: Record<AuditStatus, number>;
    storedInchiKeyMismatches: number;
    recommendedCandidates: number;
    reviewQueue: number;
  };
  reviewQueue: ClassifiedAuditRow[];
  coverageGaps: ClassifiedAuditRow[];
  rows: ClassifiedAuditRow[];
}

const AUDIT_STATUSES: AuditStatus[] = [
  "exact_match",
  "structure_mismatch",
  "name_unparsed",
  "smiles_invalid",
  "missing_iupac",
  "missing_smiles",
  "missing_both",
  "audit_error",
];

export function buildChemistryAuditReport({
  rows,
  generatedAt,
  convexUrl,
  rdkitVersion,
  opsinEndpoint,
  pubchemEndpoint,
}: {
  rows: ClassifiedAuditRow[];
  generatedAt: string;
  convexUrl: string;
  rdkitVersion: string;
  opsinEndpoint: string;
  pubchemEndpoint: string;
}): ChemistryAuditReport {
  const statusCounts = Object.fromEntries(
    AUDIT_STATUSES.map((status) => [status, rows.filter((row) => row.status === status).length]),
  ) as Record<AuditStatus, number>;
  const coverageStatuses: Partial<Record<AuditStatus, true>> = {
    missing_iupac: true,
    missing_smiles: true,
    missing_both: true,
  };
  const reviewQueue = rows.filter((row) => row.reviewReasons.length > 0);
  const coverageGaps = rows.filter((row) => coverageStatuses[row.status]);

  return {
    schemaVersion: "iupac-name-audit-v1",
    generatedAt,
    source: {
      convexUrl,
      deployment: new URL(convexUrl).hostname.split(".")[0] ?? "unknown",
    },
    providers: {
      rdkitVersion,
      opsinEndpoint,
      pubchemEndpoint,
    },
    semantics: {
      passCondition: "The stored SMILES and stored IUPAC name independently produce identical standard InChI strings.",
      candidatePolicy: "A PubChem IUPACName is recommended only when OPSIN parses it and RDKit reproduces the stored-SMILES standard InChI exactly.",
      nonGoals: [
        "Selecting a unique preferred IUPAC name from multiple valid systematic names.",
        "Inferring that a plant, preparation, mixture, salt, or representative active compound is a single chemical entity.",
        "Writing any Convex or article data.",
      ],
    },
    summary: {
      total: rows.length,
      withSmiles: rows.filter((row) => row.smiles).length,
      withIupac: rows.filter((row) => row.iupacName).length,
      withBoth: rows.filter((row) => row.smiles && row.iupacName).length,
      statusCounts,
      storedInchiKeyMismatches: rows.filter((row) => row.storedInchiKeyMatches === false).length,
      recommendedCandidates: rows.filter((row) => row.recommendedCandidate).length,
      reviewQueue: reviewQueue.length,
    },
    reviewQueue,
    coverageGaps,
    rows,
  };
}

export const MISSING_STRUCTURE: StructureResolution = Object.freeze({
  status: "missing",
  inchi: null,
  inchiKey: null,
  canonicalSmiles: null,
});

export const MISSING_OPSIN: OpsinResolution = Object.freeze({
  status: "missing",
  message: "No name supplied.",
  smiles: null,
  standardInchi: null,
  standardInchiKey: null,
});

export const MISSING_PUBCHEM: PubchemResolution = Object.freeze({
  status: "missing",
  message: "No SMILES supplied.",
  cid: null,
  title: null,
  iupacName: null,
  smiles: null,
  inchiKey: null,
  molecularFormula: null,
  recordCount: 0,
});
