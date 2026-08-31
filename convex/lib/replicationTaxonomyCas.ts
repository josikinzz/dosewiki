import type { Doc } from "../_generated/dataModel";
import { isPlaceholderStorageId, isValidR2Key } from "./replicationUrls";

export type ReplicationTaxonomyLocator = {
  storage_id: string | null;
  r2_key: string | null;
  url: string | null;
};

function isValidDirectUrl(value: string | null) {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** A taxonomy CAS must be anchored to one real, unchanged main-media locator. */
export function replicationTaxonomyLocatorMatches(
  row: Pick<Doc<"replications">, "storage_id" | "r2_key" | "url">,
  expected: ReplicationTaxonomyLocator,
) {
  const hasLocator = isValidR2Key(expected.r2_key)
    || !isPlaceholderStorageId(expected.storage_id)
    || isValidDirectUrl(expected.url);
  return hasLocator
    && (row.storage_id ?? null) === expected.storage_id
    && (row.r2_key ?? null) === expected.r2_key
    && (row.url ?? null) === expected.url;
}
