/**
 * Read projections for the lossless Effect Index archive table.
 *
 * The archive preserves imported Mongo documents as JSON strings, including
 * extended-JSON wrappers (`{"$oid": …}`, `{"$date": …}`). This representation
 * originated with the original import and remains unchanged in Postgres.
 * Decoding means `JSON.parse` plus unwrapping. The row content is not
 * schema-checked, so malformed rows must not take down the blog index.
 *
 * Plain TypeScript with no Postgres imports on purpose, so it is unit-testable without a
 * Postgres client and importable from both a Postgres query handler and the Next read adapter
 * (the same arrangement `substanceReadProjections.ts` already has).
 */

/** The archive row as stored. `payload` is `v.any()` in the schema, hence `unknown`. */


/** The public shape a decoded `kind: "post"` archive row projects into. */
export type PublicEffectIndexPost = {
  slug: string;
  title: string;
  author: string;
  /** ISO 8601 instant, or `null` when the archived record carried no usable date. */
  timestamp: string | null;
  /** Markdown source. */
  body: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Parse the verbatim JSON string a payload is stored as. Tolerates an already-decoded
 * object so a caller that hydrates the row differently still projects.
 */
function parseArchivePayload(payload: unknown): Record<string, unknown> | null {
  if (isRecord(payload)) {
    return payload;
  }

  if (typeof payload !== "string") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(payload);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The widest instant a JS `Date` can hold (ECMA-262 "time value" limit). `Number.isFinite`
 * is *not* sufficient to guard `new Date(ms).toISOString()`: a finite but out-of-range
 * epoch (e.g. a `$numberLong` of `99999999999999999`) yields an Invalid Date, and
 * `toISOString()` throws `RangeError` on it. This module must never throw.
 */
const MAX_DATE_TIME_VALUE = 8.64e15;

function toIsoInstant(epochMs: number): string | null {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > MAX_DATE_TIME_VALUE) {
    return null;
  }

  return new Date(epochMs).toISOString();
}

/**
 * Unwrap a Mongo extended-JSON date. Production stores `{"$date": "<ISO string>"}`; the
 * numeric (`{"$date": {"$numberLong": "…"}}`) and bare forms are accepted defensively
 * because the same importer would pass them through unchanged.
 */
export function unwrapMongoDate(value: unknown): string | null {
  const candidate = isRecord(value) ? value.$date : value;
  const inner = isRecord(candidate) ? candidate.$numberLong : candidate;

  if (typeof inner === "number") {
    return toIsoInstant(inner);
  }

  const text = nonEmptyString(inner);

  if (!text) {
    return null;
  }

  // A `$numberLong` arrives as a decimal string; anything else is an ISO instant.
  return toIsoInstant(/^-?\d+$/.test(text) ? Number(text) : Date.parse(text));
}

/**
 * Decode one archive row into the public post shape, or `null` when the row is not a
 * usable post. Never throws.
 *
 * The row's `key` is the authoritative slug (the importer keys posts by `payload.slug`);
 * `payload.slug` is only a fallback for a row whose key was lost.
 */
export function projectPublicEffectIndexPost(record: unknown): PublicEffectIndexPost | null {
  if (!isRecord(record)) {
    return null;
  }

  const payload = parseArchivePayload(record.payload);

  if (!payload) {
    return null;
  }

  const slug = nonEmptyString(record.key) ?? nonEmptyString(payload.slug);
  const title = nonEmptyString(payload.title);
  const body = typeof payload.body === "string" ? payload.body : null;

  if (!slug || !title || body === null) {
    return null;
  }

  return {
    slug,
    title,
    author: nonEmptyString(payload.author) ?? "",
    timestamp: unwrapMongoDate(payload.datetime),
    body,
  };
}

/**
 * Decode a list of archive rows, dropping any that fail to project, newest first. Rows
 * without a timestamp sort last so a decode gap never displaces a dated post.
 */
export function projectPublicEffectIndexPosts(records: readonly unknown[]): PublicEffectIndexPost[] {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .flatMap((record) => {
      const post = projectPublicEffectIndexPost(record);
      return post ? [post] : [];
    })
    .sort((left, right) => {
      if (left.timestamp === right.timestamp) {
        return left.slug.localeCompare(right.slug);
      }
      if (!left.timestamp) return 1;
      if (!right.timestamp) return -1;
      return right.timestamp.localeCompare(left.timestamp);
    });
}
