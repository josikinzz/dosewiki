import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  MISSING_PUBCHEM,
  type OpsinResolution,
  type PubchemResolution,
} from "./iupacNameAudit";

export const OPSIN_ENDPOINT = "https://www.ebi.ac.uk/opsin/ws";
export const PUBCHEM_ENDPOINT =
  "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/IUPACName,Title,SMILES,InChIKey,MolecularFormula/JSON";

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const PROVIDER_BATCH_SIZE = 4;
const PROVIDER_BATCH_INTERVAL_MS = 1_000;
const MAX_FETCH_ATTEMPTS = 3;

interface CacheEntry<T> {
  fetchedAt: string;
  result: T;
}

export interface ProviderCache {
  schemaVersion: "iupac-provider-cache-v1";
  opsin: Record<string, CacheEntry<OpsinResolution>>;
  pubchem: Record<string, CacheEntry<PubchemResolution>>;
}

interface OpsinJson {
  status?: unknown;
  message?: unknown;
  smiles?: unknown;
  stdinchi?: unknown;
  stdinchikey?: unknown;
}

interface PubchemProperty {
  CID?: unknown;
  Title?: unknown;
  IUPACName?: unknown;
  SMILES?: unknown;
  InChIKey?: unknown;
  MolecularFormula?: unknown;
}

interface PubchemJson {
  PropertyTable?: {
    Properties?: PubchemProperty[];
  };
  Fault?: {
    Message?: unknown;
  };
}

function emptyCache(): ProviderCache {
  return {
    schemaVersion: "iupac-provider-cache-v1",
    opsin: {},
    pubchem: {},
  };
}

export function readProviderCache(cachePath: string): ProviderCache {
  if (!existsSync(cachePath)) return emptyCache();
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as Partial<ProviderCache>;
    if (parsed.schemaVersion !== "iupac-provider-cache-v1") return emptyCache();
    return {
      schemaVersion: "iupac-provider-cache-v1",
      opsin: parsed.opsin ?? {},
      pubchem: parsed.pubchem ?? {},
    };
  } catch {
    return emptyCache();
  }
}

export function writeProviderCache(cachePath: string, cache: ProviderCache): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function cleanProviderString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function getFreshCacheResult<T>(
  entry: CacheEntry<T> | undefined,
  refresh: boolean,
  now = Date.now(),
): T | null {
  if (!entry || refresh) return null;
  const fetchedAt = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(fetchedAt) || now - fetchedAt > CACHE_MAX_AGE_MS) return null;
  return entry.result;
}

async function fetchWithRetries(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);
      lastResponse = response;
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === MAX_FETCH_ATTEMPTS) return response;
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfterSeconds)
        ? Math.min(Math.max(retryAfterSeconds * 1_000, 1_000), 30_000)
        : attempt * 2_000;
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_FETCH_ATTEMPTS) await sleep(attempt * 2_000);
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error(`${label} failed after ${MAX_FETCH_ATTEMPTS} attempts: ${String(lastError)}`);
}

async function fetchOpsin(name: string): Promise<OpsinResolution> {
  const url = `${OPSIN_ENDPOINT}/${encodeURIComponent(name)}.json`;
  try {
    const response = await fetchWithRetries(url, { headers: { accept: "application/json" } }, "OPSIN request");
    const text = await response.text();
    let payload: OpsinJson = {};
    try {
      payload = JSON.parse(text) as OpsinJson;
    } catch {
      if (!response.ok) {
        return {
          status:
            response.status >= 400 && response.status < 500 && response.status !== 429
              ? "unparsed"
              : "error",
          message: text.slice(0, 500) || `OPSIN returned HTTP ${response.status}.`,
          smiles: null,
          standardInchi: null,
          standardInchiKey: null,
          httpStatus: response.status,
        };
      }
      return {
        status: "error",
        message: "OPSIN returned non-JSON content.",
        smiles: null,
        standardInchi: null,
        standardInchiKey: null,
        httpStatus: response.status,
      };
    }

    const providerStatus = cleanProviderString(payload.status)?.toUpperCase();
    const status: OpsinResolution["status"] =
      providerStatus === "SUCCESS"
        ? "success"
        : providerStatus === "WARNING"
          ? "warning"
          : response.status === 404 || providerStatus === "FAILURE"
            ? "unparsed"
            : "error";
    return {
      status,
      message: cleanProviderString(payload.message) ?? "",
      smiles: cleanProviderString(payload.smiles),
      standardInchi: cleanProviderString(payload.stdinchi),
      standardInchiKey: cleanProviderString(payload.stdinchikey),
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      status: "error",
      message: String(error),
      smiles: null,
      standardInchi: null,
      standardInchiKey: null,
    };
  }
}

async function fetchPubchem(smiles: string, expectedInchiKey: string | null): Promise<PubchemResolution> {
  try {
    const response = await fetchWithRetries(
      PUBCHEM_ENDPOINT,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ smiles }),
      },
      "PubChem request",
    );
    const text = await response.text();
    let payload: PubchemJson = {};
    try {
      payload = JSON.parse(text) as PubchemJson;
    } catch {
      return {
        ...MISSING_PUBCHEM,
        status: response.status === 404 ? "not_found" : "error",
        message: text.slice(0, 500) || `PubChem returned HTTP ${response.status}.`,
        httpStatus: response.status,
      };
    }

    const properties = payload.PropertyTable?.Properties ?? [];
    if (!response.ok || properties.length === 0) {
      return {
        ...MISSING_PUBCHEM,
        status: response.status === 404 ? "not_found" : "error",
        message:
          cleanProviderString(payload.Fault?.Message) ??
          `PubChem returned HTTP ${response.status} with no compound record.`,
        httpStatus: response.status,
      };
    }

    const selected =
      properties.find((property) => cleanProviderString(property.InChIKey) === expectedInchiKey) ??
      (properties.length === 1 ? properties[0] : null);
    if (!selected) {
      return {
        ...MISSING_PUBCHEM,
        status: "ambiguous",
        message: `PubChem returned ${properties.length} records and none matched the computed InChIKey.`,
        recordCount: properties.length,
        httpStatus: response.status,
      };
    }

    const selectedInchiKey = cleanProviderString(selected.InChIKey);
    const inchiKeyNote =
      expectedInchiKey && selectedInchiKey !== expectedInchiKey
        ? "PubChem's sole record differs from the locally computed InChIKey; any name still requires the independent round trip."
        : properties.length > 1
          ? `Selected one of ${properties.length} records by InChIKey.`
          : "";
    return {
      status: "success",
      message: inchiKeyNote,
      cid: typeof selected.CID === "number" ? selected.CID : null,
      title: cleanProviderString(selected.Title),
      iupacName: cleanProviderString(selected.IUPACName),
      smiles: cleanProviderString(selected.SMILES),
      inchiKey: selectedInchiKey,
      molecularFormula: cleanProviderString(selected.MolecularFormula),
      recordCount: properties.length,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      ...MISSING_PUBCHEM,
      status: "error",
      message: String(error),
    };
  }
}

async function resolveInBatches<T>(
  label: string,
  values: string[],
  resolver: (value: string) => Promise<T>,
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  for (let offset = 0; offset < values.length; offset += PROVIDER_BATCH_SIZE) {
    const startedAt = Date.now();
    const batch = values.slice(offset, offset + PROVIDER_BATCH_SIZE);
    const resolved = await Promise.all(batch.map(async (value) => [value, await resolver(value)] as const));
    for (const [value, result] of resolved) results.set(value, result);
    const completed = Math.min(offset + batch.length, values.length);
    if (completed === values.length || completed % 40 === 0) {
      console.log(`${label}: ${completed}/${values.length}`);
    }
    const remainingDelay = PROVIDER_BATCH_INTERVAL_MS - (Date.now() - startedAt);
    if (completed < values.length && remainingDelay > 0) await sleep(remainingDelay);
  }
  return results;
}

export async function resolveOpsinNames(
  names: string[],
  cache: ProviderCache,
  refresh: boolean,
): Promise<Map<string, OpsinResolution>> {
  const uniqueNames = [...new Set(names)].sort((left, right) => left.localeCompare(right));
  const results = new Map<string, OpsinResolution>();
  const missing: string[] = [];
  for (const name of uniqueNames) {
    const cached = getFreshCacheResult(cache.opsin[name], refresh);
    if (cached) results.set(name, cached);
    else missing.push(name);
  }
  if (missing.length > 0) {
    const fetched = await resolveInBatches("OPSIN", missing, fetchOpsin);
    for (const [name, result] of fetched) {
      results.set(name, result);
      if (result.status !== "error") {
        cache.opsin[name] = { fetchedAt: new Date().toISOString(), result };
      }
    }
  }
  console.log(`OPSIN cache hits: ${uniqueNames.length - missing.length}; fetched: ${missing.length}`);
  return results;
}

export async function resolvePubchemSmiles(
  smilesValues: string[],
  expectedInchiKeys: Map<string, string | null>,
  cache: ProviderCache,
  refresh: boolean,
): Promise<Map<string, PubchemResolution>> {
  const uniqueSmiles = [...new Set(smilesValues)].sort((left, right) => left.localeCompare(right));
  const results = new Map<string, PubchemResolution>();
  const missing: string[] = [];
  for (const smiles of uniqueSmiles) {
    const cached = getFreshCacheResult(cache.pubchem[smiles], refresh);
    if (cached) results.set(smiles, cached);
    else missing.push(smiles);
  }
  if (missing.length > 0) {
    const fetched = await resolveInBatches("PubChem", missing, (smiles) =>
      fetchPubchem(smiles, expectedInchiKeys.get(smiles) ?? null),
    );
    for (const [smiles, result] of fetched) {
      results.set(smiles, result);
      if (result.status !== "error") {
        cache.pubchem[smiles] = { fetchedAt: new Date().toISOString(), result };
      }
    }
  }
  console.log(`PubChem cache hits: ${uniqueSmiles.length - missing.length}; fetched: ${missing.length}`);
  return results;
}
