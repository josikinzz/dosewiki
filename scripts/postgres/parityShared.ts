/**
 * Ticket 21 helpers shared by the parity orchestrator and its in-process
 * children: canonical Convex-value normalisation, structural diffing, drift
 * classification, and latency percentiles.
 */

import { convexToJson, type Value } from "convex/values";

/** The PlanetScale snapshot is the 2026-09-09 production export (ticket 02). */
export const SNAPSHOT_AT = Date.parse("2026-09-09T20:32:00Z");

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Convex wire form with sorted object keys: `$float` for NaN and infinities,
 * `$integer` for bigints, undefined fields dropped, exactly what the Convex
 * HTTP client already delivered for the Convex side.
 */
export function canonical(value: unknown): Json {
  if (value === undefined) return null;
  return convexToJson(value as Value) as Json;
}

export function stableStringify(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export type Difference = { path: string; left: unknown; right: unknown };

/** First differing path between two canonical values, or null when equal. */
export function firstDifference(left: Json, right: Json, path = "$"): Difference | null {
  if (left === right) return null;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return { path, left, right };
  }
  if (Array.isArray(left) !== Array.isArray(right)) return { path, left: typeof left, right: typeof right };
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return { path: `${path}.length`, left: left.length, right: right.length };
    for (let index = 0; index < left.length; index += 1) {
      const nested = firstDifference(left[index], right[index], `${path}[${index}]`);
      if (nested) return nested;
    }
    return null;
  }
  const leftRecord = left as { [key: string]: Json };
  const rightRecord = right as { [key: string]: Json };
  const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
  for (const key of keys) {
    if (!(key in leftRecord)) return { path: `${path}.${key}`, left: undefined, right: rightRecord[key] };
    if (!(key in rightRecord)) return { path: `${path}.${key}`, left: leftRecord[key], right: undefined };
    const nested = firstDifference(leftRecord[key], rightRecord[key], `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

/** Arrays re-ordered by canonical text; used where the catalog promises no order. */
export function sortInsensitive(value: Json): Json {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(sortInsensitive).sort((a, b) => (stableStringify(a) < stableStringify(b) ? -1 : 1));
  }
  const out: { [key: string]: Json } = {};
  for (const key of Object.keys(value)) out[key] = sortInsensitive(value[key]);
  return out;
}

/** Drop named top-level keys (opaque pagination cursors differ by backend). */
export function omitKeys(value: Json, keys: readonly string[]): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const out: { [key: string]: Json } = {};
  for (const key of Object.keys(value)) if (!keys.includes(key)) out[key] = value[key];
  return out;
}

const TIMESTAMP_KEY = /(updatedAt|updated_at|createdAt|created_at|publishedAt|published_at|importedAt|lastUpdated|_creationTime|publicationDate|reviewedAt|reviewed_at|savedAt|at)$/;

function parseTimestamp(value: Json): number | null {
  if (typeof value === "number") {
    // Millisecond epochs only; small numbers are ids, counts, or seconds we cannot trust.
    return value > 1_000_000_000_000 && value < 4_000_000_000_000 ? value : null;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Newest timestamp-shaped field anywhere inside a value, or null. */
export function newestTimestamp(value: Json): number | null {
  let newest: number | null = null;
  const visit = (node: Json, key: string | null) => {
    if (node === null) return;
    if (typeof node !== "object") {
      if (key !== null && TIMESTAMP_KEY.test(key)) {
        const parsed = parseTimestamp(node);
        if (parsed !== null && (newest === null || parsed > newest)) newest = parsed;
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    for (const [childKey, child] of Object.entries(node)) visit(child, childKey);
  };
  visit(value, null);
  return newest;
}

const IDENTITY_KEYS = ["_id", "slug", "key", "entryId", "id", "name"] as const;

/** Identity of a list element, for aligning Convex and Postgres rows. */
export function identityOf(item: Json): string | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return typeof item === "string" ? item : null;
  for (const key of IDENTITY_KEYS) {
    const candidate = item[key];
    if (typeof candidate === "string" || typeof candidate === "number") return `${key}:${candidate}`;
  }
  return null;
}

/** A row's own name fields; `article_id` is how the reviewed-article rows name their article. */
const NAME_KEYS = ["slug", "key", "article_id", "articleSlug"] as const;

/**
 * The names by which the Convex changelog could name this row: its own
 * top-level name fields, plus the slugs of a changelog entry's `articles`.
 * Deliberately shallow. A slug that merely appears somewhere inside a row (a
 * related-substance list, say) is a reference, not evidence that this row
 * moved, and treating it as evidence would excuse real content differences.
 */
export function namesOf(item: Json | undefined): Set<string> {
  const names = new Set<string>();
  if (item === null || item === undefined || typeof item !== "object" || Array.isArray(item)) return names;
  for (const key of NAME_KEYS) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) names.add(value);
  }
  const articles = item.articles;
  if (Array.isArray(articles)) {
    for (const article of articles) {
      if (article === null || typeof article !== "object" || Array.isArray(article)) continue;
      const slug = article.slug;
      if (typeof slug === "string" && slug.length > 0) names.add(slug);
    }
  }
  return names;
}

export type Classification = "drift" | "defect" | "storage-pending";

/**
 * Delivery base for R2-backed media, as the serving deployment configures it
 * (`REPLICATION_MEDIA_BASE_URL`). Set once per run so a residual media URL
 * difference can be told apart from a content difference.
 */
let mediaBaseUrl: string | null = null;
export function setMediaBaseUrl(base: string | null): void {
  mediaBaseUrl = base;
}

/** Keys whose value is a delivery URL: `url`, `thumbnail_url`, `avatarUrl`. */
const STORAGE_URL_KEY = /(^url|_url|Url)$/;

/**
 * The archive's content-addressed delivery path, digest and shard captured:
 * `<base>/media/sha256/<first-two-hex>/<sha256>.<ext>` (the same shape
 * `convex/lib/replicationUrls.ts` accepts). A media URL that does not match
 * cannot be checked against the object it claims to serve.
 */
const CANONICAL_MEDIA_URL = /\/media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.[a-z0-9]{2,5}$/;

/** A URL only a storage or media backend can mint: Convex Storage or the R2 delivery worker. */
function isStorageUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (/^https:\/\/[a-z0-9-]+\.convex\.cloud\/api\/storage\//.test(value)) return true;
  return mediaBaseUrl !== null && value.startsWith(`${mediaBaseUrl}/`);
}

/**
 * Ticket 11 copied the bytes (2026-09-10) and wrote the `storageObjects`
 * identity rows, so `ctx.storage.getUrl` answers on Postgres too. What remains
 * is an origin difference, not a missing object: for the seven objects whose
 * `replications`/`contributorProfiles` row carries no `r2_key`, Convex resolves
 * through its own Storage while Postgres resolves through the identity map onto
 * the content-addressed R2 archive. The bytes are the same (the Postgres URL
 * names their sha256), so this is `storage-pending` until the rows themselves
 * carry the key, and reaching zero means writing `r2_key` on those rows, which
 * is a Convex data fix (ticket 23), not a runtime defect.
 *
 * Three shapes are accepted, none of them a defect of the SQL runtime:
 *
 *   1. the rows are identical apart from storage-served URL fields, and the
 *      Postgres side is a canonical `media/sha256/<xx>/<digest>.<ext>` URL;
 *   2. the same, with Postgres still answering null (no mapping at all);
 *   3. the row is absent on Postgres because Convex Storage was its only media
 *      source and nothing maps it, so a projection that requires a URL drops it.
 *
 * Anything else stays a defect: notably a Postgres media URL that is not a
 * canonical digest key, which would mean the mapping points somewhere the
 * archive cannot vouch for.
 */
function storagePendingReason(convexRow: Json | undefined, postgresRow: Json | undefined): string | null {
  if (convexRow !== undefined && postgresRow === undefined) return convexStorageOnlyReason(convexRow);
  if (convexRow === undefined || postgresRow === undefined) return null;
  const differences = collectDifferences(convexRow, postgresRow);
  if (differences.length === 0) return null;
  const hosts = new Set<string>();
  const fields = new Set<string>();
  const digests = new Set<string>();
  let postgresNull = false;
  for (const difference of differences) {
    const key = (difference.path.split(".").pop() ?? "").replace(/\[\d+\]$/, "");
    if (!STORAGE_URL_KEY.test(key)) return null;
    const sides = [difference.left, difference.right];
    // One side must be a storage-minted URL, and neither side may carry structure.
    if (!sides.some(isStorageUrl)) return null;
    if (!sides.every((side) => side === undefined || side === null || typeof side === "string")) return null;
    // The Postgres side is what the cutover will serve: a media-base URL that
    // is not a canonical digest key is unvouched delivery, so it stays a defect.
    if (typeof difference.right === "string" && mediaBaseUrl !== null && difference.right.startsWith(`${mediaBaseUrl}/`)) {
      const canonicalKey = CANONICAL_MEDIA_URL.exec(difference.right);
      if (canonicalKey === null || !canonicalKey[2].startsWith(canonicalKey[1])) return null;
      digests.add(canonicalKey[2]);
    } else if (difference.right === null || difference.right === undefined) {
      postgresNull = true;
    }
    fields.add(key);
    for (const side of sides) {
      if (typeof side !== "string") continue;
      try { hosts.add(new URL(side).host); } catch { return null; }
    }
  }
  const field = `identical apart from storage-served URL field(s) ${[...fields].sort().join(", ")} (hosts: ${[...hosts].sort().join(" vs ")})`;
  if (postgresNull && digests.size === 0) {
    return `${field}; no storageObjects mapping exists for the object, so ctx.storage.getUrl answers null on Postgres`;
  }
  return `${field}; both backends deliver the same object, Postgres from the content-addressed R2 copy ticket 11 made (sha256 ${[...digests].sort().join(", ")}) and Convex from its own Storage because the row carries no r2_key. Reaching zero needs r2_key written on the row, a Convex data fix deferred to ticket 23`;
}

/**
 * A row Convex serves and Postgres omits is storage-pending only when every
 * delivery URL it carries comes from Convex Storage and nothing maps the object:
 * the Postgres projection then has no URL to publish. One media-base URL
 * anywhere means the media does migrate and the absence is a real defect.
 */
function convexStorageOnlyReason(convexRow: Json): string | null {
  const urls: string[] = [];
  const visit = (node: Json, key: string | null) => {
    if (node === null) return;
    if (typeof node === "string") {
      if (key !== null && STORAGE_URL_KEY.test(key) && /^https?:\/\//.test(node)) urls.push(node);
      return;
    }
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    for (const [childKey, child] of Object.entries(node)) visit(child, childKey);
  };
  visit(convexRow, null);
  if (urls.length === 0) return null;
  if (!urls.every(isStorageUrl)) return null;
  if (mediaBaseUrl !== null && urls.some((url) => url.startsWith(`${mediaBaseUrl}/`))) return null;
  const hosts = [...new Set(urls.map((url) => new URL(url).host))].sort();
  return `row is served only from Convex Storage (${hosts.join(", ")}) and no storageObjects row maps the object, so the Postgres projection has no URL and drops it`;
}

/**
 * Every differing path between two canonical values, bounded so one wrong
 * shape cannot produce an unbounded report.
 */
export function collectDifferences(left: Json, right: Json, limit = 64, path = "$", out: Difference[] = []): Difference[] {
  if (out.length >= limit || left === right) return out;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    out.push({ path, left, right });
    return out;
  }
  if (Array.isArray(left) !== Array.isArray(right)) {
    out.push({ path, left: typeof left, right: typeof right });
    return out;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) out.push({ path: `${path}.length`, left: left.length, right: right.length });
    for (let index = 0; index < Math.min(left.length, right.length) && out.length < limit; index += 1) {
      collectDifferences(left[index], right[index], limit, `${path}[${index}]`, out);
    }
    return out;
  }
  const leftRecord = left as { [key: string]: Json };
  const rightRecord = right as { [key: string]: Json };
  for (const key of [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort()) {
    if (out.length >= limit) break;
    if (!(key in leftRecord)) out.push({ path: `${path}.${key}`, left: undefined, right: rightRecord[key] });
    else if (!(key in rightRecord)) out.push({ path: `${path}.${key}`, left: leftRecord[key], right: undefined });
    else collectDifferences(leftRecord[key], rightRecord[key], limit, `${path}.${key}`, out);
  }
  return out;
}

export type RowMismatch = {
  identity: string | null;
  path: string;
  convex: unknown;
  postgres: unknown;
  classification: Classification;
  reason: string;
};

/**
 * Explain a list or document mismatch row by row. A row that differs only in
 * storage-served URL fields is `storage-pending` (ticket 11); Convex rows newer
 * than the snapshot, or whose article the Convex changelog names after it, are
 * `drift`; everything else is a defect until proven otherwise.
 *
 * The changelog names articles by slug, while a row's identity is often its
 * `_id`, so the row's own slug-shaped fields are what gets matched, not only
 * the identity string: a fentanyl edit journalled after the snapshot explains a
 * `_id:...` row of `substanceIndex` just as well as a `slug:fentanyl` one.
 *
 * A limited list has a second drift shape: when Convex gained rows after the
 * snapshot and the list is capped (`getRecent limit 50`), those new rows push
 * older ones out of Convex's window while the snapshot still holds them, so a
 * Postgres-only row inside an otherwise equal-length window is that eviction,
 * not a missing Convex row.
 */
export function classifyMismatch(
  convex: Json,
  postgres: Json,
  changedSinceSnapshot: ReadonlySet<string>,
  difference: Difference,
): RowMismatch[] {
  const pickList = (value: Json): Json[] | null => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.items)) return value.items;
    return null;
  };
  const convexList = pickList(convex);
  const postgresList = pickList(postgres);
  // A capped Convex window that gained post-snapshot rows evicts its oldest.
  const convexWindowGrew =
    convexList !== null &&
    postgresList !== null &&
    convexList.length === postgresList.length &&
    convexList.some((row) => {
      const newest = newestTimestamp(row);
      return newest !== null && newest > SNAPSHOT_AT;
    });
  const explain = (identity: string | null, convexRow: Json | undefined, postgresRow: Json | undefined, path: string): RowMismatch => {
    const newest = convexRow === undefined ? null : newestTimestamp(convexRow);
    const names = namesOf(convexRow ?? postgresRow);
    if (identity !== null) {
      names.add(identity);
      const colon = identity.indexOf(":");
      if (colon > 0) names.add(identity.slice(colon + 1));
    }
    const touched = [...names].find((name) => changedSinceSnapshot.has(name));
    // Post-snapshot movement is judged first: a row Convex changed after the
    // export is drift whatever its media looks like.
    if (newest !== null && newest > SNAPSHOT_AT) {
      return { identity, path, convex: convexRow, postgres: postgresRow, classification: "drift", reason: `Convex row timestamp ${new Date(newest).toISOString()} is after the snapshot` };
    }
    if (touched !== undefined) {
      return { identity, path, convex: convexRow, postgres: postgresRow, classification: "drift", reason: `Convex changelog names ${touched} after the snapshot` };
    }
    const storagePending = storagePendingReason(convexRow, postgresRow);
    if (storagePending !== null) {
      return { identity, path, convex: convexRow, postgres: postgresRow, classification: "storage-pending", reason: storagePending };
    }
    if (convexRow !== undefined && postgresRow === undefined && newest === null) {
      return { identity, path, convex: convexRow, postgres: postgresRow, classification: "drift", reason: "row exists only on Convex and carries no timestamp; treated as created after the snapshot" };
    }
    if (convexRow === undefined && postgresRow !== undefined && convexWindowGrew) {
      const evicted = newestTimestamp(postgresRow);
      if (evicted === null || evicted <= SNAPSHOT_AT) {
        return { identity, path, convex: convexRow, postgres: postgresRow, classification: "drift", reason: "Convex's capped window slid past this row: rows newer than the snapshot entered the limited list, and the snapshot still holds the one they pushed out" };
      }
    }
    return { identity, path, convex: convexRow, postgres: postgresRow, classification: "defect", reason: "same identity, different content, no post-snapshot change recorded on Convex" };
  };
  if (convexList && postgresList) {
    const rows: RowMismatch[] = [];
    const byIdentity = new Map<string, { convex?: Json; postgres?: Json }>();
    const anonymous: { convex: Json[]; postgres: Json[] } = { convex: [], postgres: [] };
    for (const item of convexList) {
      const identity = identityOf(item);
      if (identity === null) anonymous.convex.push(item);
      else byIdentity.set(identity, { ...byIdentity.get(identity), convex: item });
    }
    for (const item of postgresList) {
      const identity = identityOf(item);
      if (identity === null) anonymous.postgres.push(item);
      else byIdentity.set(identity, { ...byIdentity.get(identity), postgres: item });
    }
    for (const [identity, pair] of byIdentity) {
      if (pair.convex === undefined || pair.postgres === undefined) {
        rows.push(explain(identity, pair.convex, pair.postgres, `${difference.path} (${pair.convex === undefined ? "postgres only" : "convex only"})`));
        continue;
      }
      const nested = firstDifference(pair.convex, pair.postgres, identity);
      if (nested) rows.push(explain(identity, pair.convex, pair.postgres, nested.path));
    }
    if (anonymous.convex.length || anonymous.postgres.length) {
      const nested = firstDifference(sortInsensitive(anonymous.convex), sortInsensitive(anonymous.postgres), `${difference.path}(anonymous)`);
      if (nested) rows.push(explain(null, anonymous.convex as unknown as Json, anonymous.postgres as unknown as Json, nested.path));
    }
    if (rows.length === 0) {
      // Same rows, different order: the caller decides whether order was promised.
      rows.push({ identity: null, path: difference.path, convex: difference.left, postgres: difference.right, classification: "defect", reason: "same rows in a different order" });
    }
    return rows;
  }
  return [explain(identityOf(convex) ?? identityOf(postgres), convex, postgres, difference.path)];
}

export function percentile(samples: readonly number[], fraction: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] * 10) / 10;
}

export function redact(url: string): string {
  return url.replace(/\/\/[^@]*@/, "//<redacted>@");
}
