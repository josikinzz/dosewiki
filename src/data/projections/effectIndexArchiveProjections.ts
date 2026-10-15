export type PublicEffectIndexPost = {
  slug: string;
  title: string;
  author: string;
  timestamp: string | null;
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

const MAX_DATE_TIME_VALUE = 8.64e15;

function toIsoInstant(epochMs: number): string | null {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > MAX_DATE_TIME_VALUE) {
    return null;
  }

  return new Date(epochMs).toISOString();
}

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

  return toIsoInstant(/^-?\d+$/.test(text) ? Number(text) : Date.parse(text));
}

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
