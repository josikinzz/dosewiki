import { z } from "zod";
import type {
  PublicSubstancePreview,
  PublicSubstanceRecord,
} from "@server/data/publicData";
import type { NormalizedReagentData } from "@/types/reagent";
import { curatedEffectPosition, type GalleryReplication } from "@/types/replications";

export const PUBLIC_API_VERSION = "v1" as const;
export const PUBLIC_API_BASE_PATH = "/api/v1" as const;
const PUBLIC_API_DEFAULT_LIMIT = 25
const PUBLIC_API_MAX_LIMIT = 100
const PUBLIC_API_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=3600"
const PUBLIC_API_CDN_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600"
export const PUBLIC_API_DISCLAIMER =
  "DoseWiki content is provided for harm-reduction education and is not medical advice.";

const cursorSchema = z.object({ offset: z.number().int().nonnegative() });

export type PublicApiErrorCode =
  | "invalid_request"
  | "invalid_cursor"
  | "not_found"
  | "service_unavailable";

export function getPublicApiCorsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
  });
}

export function applyPublicApiCors(response: Response): Response {
  for (const [key, value] of getPublicApiCorsHeaders())
    response.headers.set(key, value);
  return response;
}

export function getPublicApiResponseHeaders(
  options: { cache?: boolean } = {},
): Headers {
  const headers = getPublicApiCorsHeaders();
  headers.set("X-Content-Type-Options", "nosniff");
  if (options.cache !== false) {
    headers.set("Cache-Control", PUBLIC_API_CACHE_CONTROL);
    headers.set("CDN-Cache-Control", PUBLIC_API_CDN_CACHE_CONTROL);
  }
  return headers;
}

export function publicApiError(code: PublicApiErrorCode, message: string) {
  return {
    error: { code, message },
    meta: { api_version: PUBLIC_API_VERSION },
  };
}

export function encodePublicApiCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function decodePublicApiCursor(cursor: string | null): number | null {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    const result = cursorSchema.safeParse(parsed);
    return result.success ? result.data.offset : null;
  } catch {
    return null;
  }
}

export function parsePublicApiLimit(value: string | null): number | null {
  if (value === null) return PUBLIC_API_DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= PUBLIC_API_MAX_LIMIT ? limit : null;
}

export function projectPublicApiSubstancePreview(
  article: PublicSubstancePreview,
) {
  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    priority: article.priority,
    categories: article.indexCategories,
    url: `https://dose.wiki/${article.slug}`,
  };
}

export function projectPublicApiReagentTesting(
  authored: Record<string, string>,
  external: NormalizedReagentData | null,
) {
  const authoredResults = Object.entries(authored)
    .filter(([, description]) => description.trim())
    .map(([reagent, description]) => ({ reagent, description }));

  if (authoredResults.length > 0) {
    return {
      source: "authored" as const,
      substance: null,
      results: authoredResults,
    };
  }

  if (!external) {
    return { source: "none" as const, substance: null, results: [] };
  }

  return {
    source: "protestkit_snapshot" as const,
    substance: external.substance,
    results: external.reagents.map(
      ({ key: _key, isKnownReagent: _known, ...result }) => result,
    ),
  };
}

export function projectPublicApiReplication(replication: GalleryReplication) {
  return {
    slug: replication.slug,
    title: replication.title,
    artist: replication.artist,
    ...(replication.artist_url ? { artist_url: replication.artist_url } : {}),
    type: replication.type,
    effect_slug: replication.effect_slug,
    effect_tags: replication.effect_tags ?? [],
    url: replication.url,
    ...(replication.thumbnail_url
      ? { thumbnail_url: replication.thumbnail_url }
      : {}),
    ...(replication.preview_url
      ? { preview_url: replication.preview_url }
      : {}),
    ...(replication.motion_url ? { motion_url: replication.motion_url } : {}),
    ...(replication.motion_poster_url
      ? { motion_poster_url: replication.motion_poster_url }
      : {}),
    ...(replication.width ? { width: replication.width } : {}),
    ...(replication.height ? { height: replication.height } : {}),
    format: replication.format,
    created_at: replication.created_at,
    ...(replication.date_info ? { date_info: replication.date_info } : {}),
    ...(replication.file_size ? { file_size: replication.file_size } : {}),
    ...(replication.duration ? { duration: replication.duration } : {}),
    ...(replication.has_audio !== undefined
      ? { has_audio: replication.has_audio }
      : {}),
    // The documented `order_index` is the owning effect's rank, explicitly not
    // the requested collection's order (see docs/api.md). Derived from the
    // per-effect map so the published contract stays a single number.
    ...(curatedEffectPosition(replication) !== undefined
      ? { order_index: curatedEffectPosition(replication) }
      : {}),
    rights: {
      status: replication.rights_status ?? "unknown",
      ...(replication.license_name
        ? { license_name: replication.license_name }
        : {}),
      ...(replication.license_url
        ? { license_url: replication.license_url }
        : {}),
      ...(replication.credit_line
        ? { credit_line: replication.credit_line }
        : {}),
      ...(replication.source_url ? { source_url: replication.source_url } : {}),
      ...(replication.rightsholder
        ? { rightsholder: replication.rightsholder }
        : {}),
    },
  };
}

export function projectPublicApiSubstanceDetail(
  article: PublicSubstanceRecord,
  enrichment?: { externalReagentData?: NormalizedReagentData | null },
) {
  const bindingSites = article.pharmacology.binding_sites;

  return {
    ...article,
    pharmacology: {
      ...article.pharmacology,
      receptor_profile: bindingSites.map(({ target, ...entry }) => ({
        receptor: target,
        ...entry,
      })),
    },
    reagent_testing_normalized: projectPublicApiReagentTesting(
      article.reagent_testing,
      enrichment?.externalReagentData ?? null,
    ),
    molecule: {
      chemical_identifiers: {
        smiles: article.identification.smiles,
        inchi_key: article.identification.inchi_key,
        formula: article.identification.molecular_formula,
      },
      schemes: {
        dosewiki: {
          url: `${PUBLIC_API_BASE_PATH}/molecules/${article.slug}.svg?scheme=dosewiki`,
        },
        "effect-index": {
          url: `${PUBLIC_API_BASE_PATH}/molecules/${article.slug}.svg?scheme=effect-index`,
        },
        "effect-index-dark": {
          url: `${PUBLIC_API_BASE_PATH}/molecules/${article.slug}.svg?scheme=effect-index-dark`,
        },
      },
    },
    url: `https://dose.wiki/${article.slug}`,
  };
}
