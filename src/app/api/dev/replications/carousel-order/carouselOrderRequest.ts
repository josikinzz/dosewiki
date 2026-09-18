import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";
import { JsonBodyError } from "@/lib/http/readJsonBody";

const TARGET_KEY = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

type OrderTargetKind = "artist" | "effect" | "substance";
export type CarouselOrderBody = {
  targetKind?: unknown;
  targetKey?: unknown;
  slugs?: unknown;
  expectedOrder?: unknown;
  expectedUpdatedAt?: unknown;
  expectedRevision?: unknown;
};

export type ParsedCarouselOrder = {
  targetKind: OrderTargetKind;
  targetKey: string;
  slugs: string[];
  expectedOrder: string[] | undefined;
  expectedUpdatedAt: string | null | undefined;
  expectedRevision: string;
};

function parseTargetKind(value: unknown): OrderTargetKind {
  if (value === "artist" || value === "effect" || value === "substance") {
    return value;
  }
  throw new JsonBodyError(400, "targetKind must be artist, effect, or substance.");
}

function parseTargetKey(value: unknown): string {
  if (typeof value !== "string" || !TARGET_KEY.test(value)) {
    throw new JsonBodyError(400, "A valid collection target key is required.");
  }
  return value;
}

function parseSlugArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new JsonBodyError(
      400,
      `${field} must be an array of replication slugs.`,
    );
  }
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const slug of value) {
    if (typeof slug !== "string" || !isValidReplicationSlug(slug)) {
      throw new JsonBodyError(400, `Every ${field} entry must be a replication slug.`);
    }
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }
  return slugs;
}

export function parseCarouselOrderBody(
  raw: CarouselOrderBody,
): ParsedCarouselOrder {
  const targetKind = parseTargetKind(raw.targetKind);
  const targetKey = parseTargetKey(raw.targetKey);
  const slugs = parseSlugArray(raw.slugs, "slugs");
  if (targetKind === "artist" && slugs.length > 250) throw new JsonBodyError(400, "Artist orders support at most 250 replication slugs.");
  if (typeof raw.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedRevision)) throw new JsonBodyError(400, "Reload the stored collection order before saving.");
  const expectedOrder =
    raw.expectedOrder === undefined
      ? undefined
      : parseSlugArray(raw.expectedOrder, "expectedOrder");

  let expectedUpdatedAt: string | null | undefined;
  if (raw.expectedUpdatedAt === null) expectedUpdatedAt = null;
  else if (
    typeof raw.expectedUpdatedAt === "string" &&
    raw.expectedUpdatedAt.length > 0
  ) {
    expectedUpdatedAt = raw.expectedUpdatedAt;
  } else if (raw.expectedUpdatedAt !== undefined) {
    throw new JsonBodyError(
      400,
      "expectedUpdatedAt must be a stored timestamp, null, or omitted.",
    );
  }

  return { targetKind, targetKey, slugs, expectedOrder, expectedUpdatedAt, expectedRevision: raw.expectedRevision };
}

export function parseCarouselTargetRequest(request: Request): {
  targetKind: OrderTargetKind;
  targetKey: string;
} {
  const search = new URL(request.url).searchParams;
  return {
    targetKind: parseTargetKind(search.get("targetKind")),
    targetKey: parseTargetKey(search.get("targetKey")),
  };
}
