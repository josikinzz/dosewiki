#!/usr/bin/env bun

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import initRDKitModule, { type JSMol, type RDKitModule } from "@rdkit/rdkit";
import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  MISSING_OPSIN,
  MISSING_PUBCHEM,
  MISSING_STRUCTURE,
  buildChemistryAuditReport,
  classifyAuditRow,
  extractChemistryAuditRows,
  type StructureResolution,
} from "./iupacNameAudit";
import {
  OPSIN_ENDPOINT,
  PUBCHEM_ENDPOINT,
  readProviderCache,
  resolveOpsinNames,
  resolvePubchemSmiles,
  writeProviderCache,
} from "./iupacNameProviders";

const DEFAULT_REPORT = "tmp/iupac-audit/report.json";
const DEFAULT_CACHE = "tmp/iupac-audit/provider-cache.json";

function optionValue(argv: string[], name: string): string | null {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function parsePositiveInteger(value: string | null, name: string): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}


function printHelp() {
  console.log(`
Audit live substance IUPAC names against their stored SMILES without Postgres writes.

Usage:
  npm run audit:iupac-names
  npm run audit:iupac-names -- --slug lsd --refresh
  npm run audit:iupac-names -- --source-url URL --report PATH --fail-on-review

Options:
  --source-url URL    Postgres read source (or SOURCE_POSTGRES_URL / selected target)
  --slug SLUG         Audit one substance
  --limit N           Audit the first N slug-sorted substances
  --report PATH       Local JSON report (default: ${DEFAULT_REPORT})
  --cache PATH        Local provider cache (default: ${DEFAULT_CACHE})
  --refresh           Ignore provider cache entries
  --fail-on-review    Exit non-zero when the review queue is non-empty

The command performs public Postgres queries and writes only the local report/cache.
`);
}


function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}


async function loadRdkit(): Promise<RDKitModule> {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
  const init = initRDKitModule as unknown as (options?: {
    locateFile?: () => string;
  }) => Promise<RDKitModule>;
  return await init({ locateFile: () => wasmPath });
}

function resolveStructure(rdkit: RDKitModule, smiles: string | null): StructureResolution {
  if (!smiles) return MISSING_STRUCTURE;
  let molecule: JSMol | null = null;
  try {
    molecule = rdkit.get_mol(smiles);
    if (!molecule || !molecule.is_valid()) {
      return {
        status: "invalid",
        inchi: null,
        inchiKey: null,
        canonicalSmiles: null,
        message: "RDKit rejected the SMILES.",
      };
    }
    const inchi = molecule.get_inchi();
    return {
      status: "success",
      inchi,
      inchiKey: rdkit.get_inchikey_for_inchi(inchi),
      canonicalSmiles: molecule.get_smiles(),
    };
  } catch (error) {
    return {
      status: "error",
      inchi: null,
      inchiKey: null,
      canonicalSmiles: null,
      message: String(error),
    };
  } finally {
    molecule?.delete();
  }
}


async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  if (argv.some((argument) => ["--write", "--apply"].includes(argument))) {
    throw new Error("This audit is read-only and does not accept write/apply flags.");
  }

  const { client, fingerprint } = createDataClient({
    target: optionValue(argv, "--source-url") ?? process.env.SOURCE_POSTGRES_URL ?? null,
  });
  const reportPath = resolve(process.cwd(), optionValue(argv, "--report") ?? DEFAULT_REPORT);
  const cachePath = resolve(process.cwd(), optionValue(argv, "--cache") ?? DEFAULT_CACHE);
  const slugFilter = optionValue(argv, "--slug");
  const limit = parsePositiveInteger(optionValue(argv, "--limit"), "--limit");
  const refresh = argv.includes("--refresh");
  const failOnReview = argv.includes("--fail-on-review");

  console.log("IUPAC/SMILES audit: read-only Postgres query; local report/cache writes only.");
  console.log(`Source: ${fingerprint}`);
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  let chemistryRows = extractChemistryAuditRows(articles);
  if (slugFilter) {
    chemistryRows = chemistryRows.filter((row) => row.slug === slugFilter);
    if (chemistryRows.length === 0) throw new Error(`No substance found for slug "${slugFilter}".`);
  }
  if (limit !== null) chemistryRows = chemistryRows.slice(0, limit);
  console.log(`Substances selected: ${chemistryRows.length}`);

  const rdkit = await loadRdkit();
  const structureBySmiles = new Map<string, StructureResolution>();
  for (const row of chemistryRows) {
    if (row.smiles && !structureBySmiles.has(row.smiles)) {
      structureBySmiles.set(row.smiles, resolveStructure(rdkit, row.smiles));
    }
  }
  const expectedInchiKeys = new Map(
    [...structureBySmiles].map(([smiles, structure]) => [smiles, structure.inchiKey] as const),
  );

  const cache = readProviderCache(cachePath);
  const currentNames = chemistryRows.flatMap((row) => (row.iupacName ? [row.iupacName] : []));
  const smilesValues = chemistryRows.flatMap((row) => (row.smiles ? [row.smiles] : []));
  const [currentOpsinByName, pubchemBySmiles] = await Promise.all([
    resolveOpsinNames(currentNames, cache, refresh),
    resolvePubchemSmiles(smilesValues, expectedInchiKeys, cache, refresh),
  ]);

  const candidateNames = [...pubchemBySmiles.values()].flatMap((result) =>
    result.status === "success" && result.iupacName ? [result.iupacName] : [],
  );
  const unresolvedCandidateNames = candidateNames.filter((name) => !currentOpsinByName.has(name));
  const resolvedCandidateNames = await resolveOpsinNames(unresolvedCandidateNames, cache, refresh);
  const candidateOpsinByName = new Map([...currentOpsinByName, ...resolvedCandidateNames]);
  writeProviderCache(cachePath, cache);

  const rows = chemistryRows.map((row) => {
    const sourceStructure = row.smiles
      ? structureBySmiles.get(row.smiles) ?? MISSING_STRUCTURE
      : MISSING_STRUCTURE;
    const currentNameOpsin = row.iupacName
      ? currentOpsinByName.get(row.iupacName) ?? MISSING_OPSIN
      : MISSING_OPSIN;
    const currentNameStructure = resolveStructure(rdkit, currentNameOpsin.smiles);
    const pubchem = row.smiles
      ? pubchemBySmiles.get(row.smiles) ?? MISSING_PUBCHEM
      : MISSING_PUBCHEM;
    const candidateOpsin = pubchem.iupacName
      ? candidateOpsinByName.get(pubchem.iupacName) ?? MISSING_OPSIN
      : MISSING_OPSIN;
    const candidateStructure = resolveStructure(rdkit, candidateOpsin.smiles);
    return classifyAuditRow({
      row,
      sourceStructure,
      currentNameOpsin,
      currentNameStructure,
      pubchem,
      candidateOpsin,
      candidateStructure,
    });
  });

  const report = buildChemistryAuditReport({
    rows,
    generatedAt: new Date().toISOString(),
    targetIdentity: fingerprint!,
    rdkitVersion: rdkit.version(),
    opsinEndpoint: OPSIN_ENDPOINT,
    pubchemEndpoint: PUBCHEM_ENDPOINT,
  });
  writeJson(reportPath, report);

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Review queue: ${report.reviewQueue.map((row) => row.slug).join(", ") || "none"}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Provider cache: ${cachePath}`);
  console.log("Postgres writes: 0");

  if (failOnReview && report.reviewQueue.length > 0) process.exitCode = 1;
}

await main();
