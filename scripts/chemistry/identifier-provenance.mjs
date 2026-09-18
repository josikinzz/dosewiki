import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const IDENTIFIER_FIELD_TO_ARTICLE_PATH = {
  smiles: "smiles",
  iupac: "iupac_name",
  cas: "cas_number",
  formula: "molecular_formula",
  molecularWeight: "molecular_weight",
  inchiKey: "inchi_key",
};

const PROVENANCE_RANK = {
  unresolved: 0,
  parsed: 1,
  opsin: 2,
  verified: 3,
  editor: 4,
}

export const OPSIN_MAP_RELATIVE_PATH = "data/chemistry/iupacSmilesMap.json";
const OPSIN_MAP_COMMENT_KEY = "//"
const OPSIN_MAP_COMMENT_VALUE = "Mapping of IUPAC names to SMILES strings resolved via OPSIN (https://www.ebi.ac.uk/opsin/). Null values indicate no SMILES was returned; mixture entries expose a components object keyed by compound name."

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeMolecularWeight(value) {
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  if (normalized.includes("g/mol") || normalized.includes("g·mol")) return normalized;
  return `${normalized} g/mol`;
}

export function classifySmilesValue(value) {
  if (value === null) {
    return { state: "unresolved", value: undefined };
  }

  const normalized = normalizeString(value);
  if (normalized) {
    return { state: "resolved", value: normalized };
  }

  if (isPlainObject(value) && isPlainObject(value.components)) {
    return {
      state: "mixture",
      value,
      components: Object.fromEntries(
        Object.entries(value.components)
          .map(([name, componentValue]) => [name.trim(), normalizeString(componentValue)])
          .filter(([name, componentValue]) => name && componentValue),
      ),
    };
  }

  return { state: "unresolved", value: undefined };
}

export function normalizeParsedChemistryIdentifiers(chemistry, options = {}) {
  if (!isPlainObject(chemistry)) {
    return { fields: {}, sources: [], states: {}, presentFields: new Set() };
  }

  const source = options.source ?? chemistry.source;
  const sources = Array.from(
    new Set(
      [
        ...(Array.isArray(chemistry.sources) ? chemistry.sources : []),
        ...(source ? [source] : []),
      ].filter(Boolean),
    ),
  );
  const provenance = options.provenance ?? "parsed";
  const fields = {};
  const states = {};
  const presentFields = new Set();

  if (Object.prototype.hasOwnProperty.call(chemistry, "smiles")) presentFields.add("smiles");
  const smilesState = classifySmilesValue(chemistry.smiles);
  states.smiles = smilesState.state;
  if (smilesState.state === "resolved") {
    fields.smiles = {
      value: smilesState.value,
      provenance,
      sources,
      state: smilesState.state,
    };
  } else if (smilesState.state === "mixture") {
    fields.smiles = {
      value: smilesState.value,
      provenance,
      sources,
      state: smilesState.state,
      components: smilesState.components,
    };
  }

  for (const [field, rawValue] of [
    ["iupac", chemistry.iupac],
    ["cas", chemistry.cas],
    ["formula", chemistry.formula],
    ["inchiKey", chemistry.inchiKey],
  ]) {
    if (Object.prototype.hasOwnProperty.call(chemistry, field)) presentFields.add(field);
    const value = normalizeString(rawValue);
    states[field] = value ? "resolved" : "unresolved";
    if (value) fields[field] = { value, provenance, sources, state: "resolved" };
  }

  if (Object.prototype.hasOwnProperty.call(chemistry, "molecularWeight")) {
    presentFields.add("molecularWeight");
  }
  const molecularWeight = normalizeMolecularWeight(chemistry.molecularWeight);
  states.molecularWeight = molecularWeight ? "resolved" : "unresolved";
  if (molecularWeight) {
    fields.molecularWeight = {
      value: molecularWeight,
      provenance,
      sources,
      state: "resolved",
    };
  }

  return { fields, sources, states, presentFields };
}

function normalizeOpsinMapEntry(iupac, rawSmiles) { const normalizedIupac = normalizeString(iupac);
const smilesState = classifySmilesValue(rawSmiles);
const fields = {};

if (normalizedIupac) {
  fields.iupac = {
    value: normalizedIupac,
    provenance: "opsin",
    sources: ["opsin-map"],
    state: "resolved",
  };
}

if (smilesState.state === "resolved" || smilesState.state === "mixture") {
  fields.smiles = {
    value: smilesState.value,
    provenance: "opsin",
    sources: ["opsin-map"],
    state: smilesState.state,
    ...(smilesState.components ? { components: smilesState.components } : {}),
  };
}

return {
  fields,
  sources: ["opsin-map"],
  states: {
    iupac: normalizedIupac ? "resolved" : "unresolved",
    smiles: smilesState.state,
  },
  presentFields: new Set(["iupac", "smiles"]),
}; }

export function mergeIdentifiersIntoIdentification(targetIdentification = {}, identifiers) {
  const nextIdentification = { ...targetIdentification };
  const changes = [];
  const skipped = [];
  const sourceFields = identifiers?.fields ?? {};

  for (const [identifierField, articleField] of Object.entries(IDENTIFIER_FIELD_TO_ARTICLE_PATH)) {
    const source = sourceFields[identifierField];
    if (!source || source.state === "unresolved") {
      if (identifiers?.presentFields?.has?.(identifierField)) {
        skipped.push({ field: articleField, reason: "unresolved_source" });
      }
      continue;
    }

    const sourceRank = PROVENANCE_RANK[source.provenance] ?? PROVENANCE_RANK.parsed;
    const existingValue = normalizeString(nextIdentification[articleField]);
    const existingProvenance = existingValue ? "editor" : "unresolved";
    const existingRank = PROVENANCE_RANK[existingProvenance];

    if (!existingValue || sourceRank > existingRank) {
      nextIdentification[articleField] = source.value;
      changes.push({
        field: articleField,
        value: source.value,
        provenance: source.provenance,
        previousValue: existingValue,
      });
    } else {
      skipped.push({
        field: articleField,
        reason: "existing_stronger_value",
        existingProvenance,
        sourceProvenance: source.provenance,
      });
    }
  }

  return {
    identification: nextIdentification,
    changed: changes.length > 0,
    changes,
    skipped,
  };
}

export function createOpsinSmilesMapAdapter({ rootDir, relativePath = OPSIN_MAP_RELATIVE_PATH }) {
  if (!rootDir) throw new Error("createOpsinSmilesMapAdapter requires rootDir");
  const artifactPath = path.join(rootDir, relativePath);

  return {
    artifactPath,
    relativePath,
    async exists() {
      try {
        await access(artifactPath);
        return true;
      } catch {
        return false;
      }
    },
    async readEntries() {
      if (!(await this.exists())) return {};
      const raw = await readFile(artifactPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) return {};
      const { [OPSIN_MAP_COMMENT_KEY]: _comment, ...entries } = parsed;
      return entries;
    },
    async writeEntries(entries) {
      await mkdir(path.dirname(artifactPath), { recursive: true });
      const sortedEntries = Object.entries(entries).sort((a, b) => a[0].localeCompare(b[0]));
      const outputObject = {
        [OPSIN_MAP_COMMENT_KEY]: OPSIN_MAP_COMMENT_VALUE,
        ...Object.fromEntries(sortedEntries),
      };
      await writeFile(artifactPath, `${JSON.stringify(outputObject, null, 2)}\n`, "utf8");
      return artifactPath;
    },
    normalizeEntry: normalizeOpsinMapEntry,
  };
}
