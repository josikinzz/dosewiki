import { gzipSync } from "node:zlib";
import { NextResponse } from "next/server";

/**
 * Shared envelope for the public open-data JSON downloads under `/open-data`.
 *
 * Each dataset is a daily snapshot read live from Convex through the cached
 * lib adapters: the serving routes revalidate once a day and the `vercel.json`
 * crons warm them nightly, so no static file regeneration is involved.
 */
export const OPEN_DATA_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

/**
 * dose.wiki's substance prose, the schema, and the normalization work are CC0,
 * but every article document also carries an `interactions` object populated
 * from TripSit combination guidance, which keeps TripSit's non-commercial
 * attribution terms — the reuse matrix at {@link OPEN_DATA_LICENSE_URL} is
 * authoritative. A blanket CC0 claim on this dataset would be false.
 */
export const OPEN_DATA_SUBSTANCE_INDEX_LICENSE =
  "Mixed — CC0 except the interactions field, which keeps TripSit's non-commercial attribution terms";

/**
 * Effect prose and the index structure are CC0, but the records reference
 * replication media — `audio_replications` entries plus the `gallery_order` and
 * `social_media_image` image references — credited to third-party creators who
 * retain their rights, so this dataset cannot be dedicated wholesale either.
 */
export const OPEN_DATA_EFFECT_INDEX_LICENSE =
  "Mixed — CC0 except the replication media it references, whose rights remain with the credited creator or rightsholder";

/**
 * dose.wiki-authored trip report prose is CC0, but legacy report rights remain
 * with their authors unless marked otherwise — the reuse matrix at
 * {@link OPEN_DATA_LICENSE_URL} is authoritative. A blanket CC0 claim on this
 * dataset would be false.
 */
export const OPEN_DATA_TRIP_REPORT_LICENSE =
  "Mixed — rights to legacy trip reports remain with their authors unless marked otherwise";

export const OPEN_DATA_LICENSE_URL = "https://dose.wiki/docs/license";

export const OPEN_DATA_SOURCE = "https://dose.wiki";

type OpenDataRecord = Record<string, unknown>;

/**
 * Build the dataset download response: strips Convex internals (`_id`,
 * `_creationTime`) plus any dataset-specific internal fields, orders items
 * deterministically, and wraps them in the published envelope.
 *
 * The body is gzipped in the route rather than left to the platform: Vercel
 * fails the build when a prerendered ISR body exceeds ~19 MB, and the raw
 * SubstanceIndex corpus crossed that line (19.23 MB on 2026-08-14). Serving
 * `Content-Encoding: gzip` keeps the cached body a few MB with ~6x headroom
 * while every HTTP client decompresses transparently.
 */
export function openDataResponse(options: {
  /** Envelope name and attachment filename stem, e.g. "SubstanceIndex". */
  dataset: string;
  /** SPDX id or descriptive terms; {@link OPEN_DATA_LICENSE_URL} has the full matrix. */
  license: string;
  items: readonly unknown[];
  /** "id" mirrors the committed SubstanceIndex.json export; "slug" elsewhere. */
  sortBy: "id" | "slug";
  /** Internal-only fields to strip beyond the Convex bookkeeping pair. */
  stripFields?: readonly string[];
}): NextResponse {
  const items = options.items.map((item): OpenDataRecord => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item as unknown as OpenDataRecord;
    }
    const record = { ...(item as OpenDataRecord) };
    delete record._id;
    delete record._creationTime;
    for (const field of options.stripFields ?? []) {
      delete record[field];
    }
    return record;
  });

  if (options.sortBy === "id") {
    // Null ids sink to the end, mirroring scripts/convex/export-convex-to-json.mjs.
    items.sort((left, right) => {
      const leftId = typeof left.id === "number" ? left.id : null;
      const rightId = typeof right.id === "number" ? right.id : null;
      if (leftId === null && rightId === null) return 0;
      if (leftId === null) return 1;
      if (rightId === null) return -1;
      return leftId - rightId;
    });
  } else {
    items.sort((left, right) =>
      String(left.slug ?? "").localeCompare(String(right.slug ?? "")),
    );
  }

  const body = gzipSync(
    JSON.stringify({
      dataset: options.dataset,
      generatedAt: new Date().toISOString(),
      count: items.length,
      license: options.license,
      licenseUrl: OPEN_DATA_LICENSE_URL,
      source: OPEN_DATA_SOURCE,
      items,
    }),
  );

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      Vary: "Accept-Encoding",
      "Content-Disposition": `attachment; filename="${options.dataset}.json"`,
      "Cache-Control": OPEN_DATA_CACHE_CONTROL,
    },
  });
}
